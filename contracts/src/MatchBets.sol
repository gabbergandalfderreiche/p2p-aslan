// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IOptimisticOracleV3, IOptimisticOracleV3CallbackRecipient} from "./interfaces/IOptimisticOracleV3.sol";

/// @title MatchBets
/// @notice Peer-to-peer bets on football matches, decided by UMA's Optimistic Oracle V3.
///
/// How it works:
///  - The curator lists matches (id from football-data.org, teams, kickoff). It cannot decide them.
///  - Two people bet against each other on a match: the creator takes one of the three outcomes
///    (home / draw / away) at a quote, the taker one of the two that are left when joining.
///    Like at a bookmaker, winnings = stake × quote: at quote 3.00 the creator stakes 10 and the
///    taker 20, at 1.50 the taker stakes 5. If the third outcome happens, both get their stake back.
///  - After the match anyone (in practice our result bot) asserts the result to UMA with a bond.
///    If nobody disputes within the liveness period, the result stands. A dispute goes to UMA's
///    voters; a rejected assertion is cleared and the result can be asserted again.
///  - Once the result stands, anyone can settle a bet: the winner gets the pot. If neither pick
///    happened, the match was void, or no result stood within RESULT_TIMEOUT after kickoff, both
///    are refunded (a result confirmed after that is ignored, so every bet ends the same way).
///
/// The owner (a timelock) can only change the curator and the fee for future bets (max 2 %).
/// It cannot move stakes, change results or change running bets.
///
/// @dev Expects plain ERC-20 tokens without transfer fees or rebasing.
contract MatchBets is Ownable2Step, ReentrancyGuard, IOptimisticOracleV3CallbackRecipient {
    using SafeERC20 for IERC20;

    /// Result after regular time (90 minutes plus stoppage time; no extra time, no penalties).
    enum Result {
        None,
        Home,
        Draw,
        Away,
        Void // cancelled, postponed or abandoned
    }

    enum Pick {
        None,
        Home,
        Draw,
        Away
    }

    enum Status {
        None,
        Open,
        Active,
        Settled,
        Cancelled
    }

    enum Payout {
        None,
        Creator,
        Taker,
        Refund
    }

    struct Match {
        uint40 kickoff;
        Result result; // final, set once the oracle confirmed an assertion
        Result asserted; // pending assertion, None if there is none
        uint40 assertedAt;
        bytes32 assertionId;
        string home;
        string away;
        string competition;
    }

    struct Bet {
        // slot 0
        address creator;
        uint96 creatorStake;
        // slot 1: invited opponent until someone joins (0 = anyone with the link), then the taker
        address taker;
        uint96 takerStake; // creatorStake × (quote − 1), fixed at creation
        // slot 2: takerPick stays None until someone joins
        uint64 matchId;
        Pick creatorPick;
        Pick takerPick;
        Status status;
        Payout payout;
        uint16 feeBps; // fee at creation; later fee changes never touch running bets
    }

    uint256 public constant RESULT_DELAY = 2 hours; // earliest assertion after kickoff
    uint256 public constant RESULT_TIMEOUT = 14 days; // no confirmed result by then -> refunds
    uint256 public constant MAX_FEE_BPS = 200; // 2 % of the pot
    uint256 public constant MIN_QUOTE = 101; // 1.01, in hundredths
    uint256 public constant MAX_QUOTE = 1000; // 10.00

    IERC20 public immutable token;
    IOptimisticOracleV3 public immutable oracle;
    IERC20 public immutable bondCurrency;
    uint256 public immutable bond;
    uint64 public immutable liveness;

    address public curator;
    uint16 public feeBps;
    address public feeRecipient;
    uint256 public betCount;

    mapping(uint64 matchId => Match) internal _matches;
    uint64[] internal _matchIds;
    mapping(bytes32 assertionId => uint64 matchId) public matchOfAssertion;
    mapping(uint256 id => Bet) internal _bets;
    /// Bets someone created, joined or was invited to.
    mapping(address user => uint256[]) internal _betsOf;

    event MatchAdded(uint64 indexed matchId, uint40 kickoff);
    event ResultAsserted(uint64 indexed matchId, bytes32 indexed assertionId, Result result, address asserter);
    event ResultConfirmed(uint64 indexed matchId, Result result);
    event ResultRejected(uint64 indexed matchId, bytes32 indexed assertionId);
    event BetCreated(uint256 indexed id, uint64 indexed matchId, address indexed creator, address invited);
    event BetJoined(uint256 indexed id, address indexed taker);
    event BetCancelled(uint256 indexed id);
    event BetSettled(uint256 indexed id, Payout payout, uint256 amount, uint256 fee);
    event CuratorChanged(address curator);
    event FeeChanged(uint16 feeBps, address feeRecipient);

    error NotCurator();
    error NotOracle();
    error UnknownMatch();
    error MatchExists();
    error InvalidMatch();
    error InvalidPick();
    error InvalidStake();
    error InvalidQuote();
    error InvalidParticipants();
    error InvalidResult();
    error InvalidFee();
    error WrongStatus();
    error NotAllowed();
    error TooLate();
    error TooEarly();
    error ResultPending();
    error ResultKnown();

    constructor(
        IERC20 token_,
        IOptimisticOracleV3 oracle_,
        IERC20 bondCurrency_,
        uint256 bond_,
        uint64 liveness_,
        address owner_,
        address curator_
    ) Ownable(owner_) {
        token = token_;
        oracle = oracle_;
        bondCurrency = bondCurrency_;
        bond = bond_;
        liveness = liveness_;
        curator = curator_;
        emit CuratorChanged(curator_);
    }

    // ---------------------------------------------------------------- matches

    /// @notice Lists a match. `matchId` is the match id on football-data.org.
    function addMatch(
        uint64 matchId,
        uint40 kickoff,
        string calldata home,
        string calldata away,
        string calldata competition
    ) external {
        if (msg.sender != curator) revert NotCurator();
        if (_matches[matchId].kickoff != 0) revert MatchExists();
        if (matchId == 0 || kickoff <= block.timestamp || bytes(home).length == 0 || bytes(away).length == 0) {
            revert InvalidMatch();
        }
        Match storage m = _matches[matchId];
        m.kickoff = kickoff;
        m.home = home;
        m.away = away;
        m.competition = competition;
        _matchIds.push(matchId);
        emit MatchAdded(matchId, kickoff);
    }

    /// @notice Asserts the result to UMA; the caller pays the bond (approve `bondCurrency` first)
    ///         and gets it back once the result stands. A wrong assertion loses the bond to the disputer.
    function assertResult(uint64 matchId, Result result) external nonReentrant returns (bytes32 assertionId) {
        Match storage m = _matches[matchId];
        if (m.kickoff == 0) revert UnknownMatch();
        if (result == Result.None) revert InvalidResult();
        if (m.result != Result.None) revert ResultKnown();
        if (m.assertionId != bytes32(0)) revert ResultPending();
        if (block.timestamp < uint256(m.kickoff) + RESULT_DELAY) revert TooEarly();
        if (_timedOut(m)) revert TooLate();

        uint256 minimum = oracle.getMinimumBond(address(bondCurrency));
        uint256 amount = bond > minimum ? bond : minimum;
        bondCurrency.safeTransferFrom(msg.sender, address(this), amount);
        bondCurrency.forceApprove(address(oracle), amount);
        m.asserted = result;
        m.assertedAt = uint40(block.timestamp);

        // The oracle is UMA's immutable contract; only the id it returns is written after the call.
        assertionId = oracle.assertTruth(
            _claim(matchId, m, result),
            msg.sender, // gets the bond back
            address(this),
            address(0),
            liveness,
            bondCurrency,
            amount,
            oracle.defaultIdentifier(),
            bytes32(0)
        );
        m.assertionId = assertionId;
        matchOfAssertion[assertionId] = matchId;
        emit ResultAsserted(matchId, assertionId, result, msg.sender);
    }

    /// @notice Settles the pending assertion at the oracle once its liveness is over; anyone can call.
    function settleResult(uint64 matchId) external {
        bytes32 id = _matches[matchId].assertionId;
        if (id == bytes32(0)) revert WrongStatus();
        oracle.settleAssertion(id); // calls assertionResolvedCallback
    }

    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external {
        if (msg.sender != address(oracle)) revert NotOracle();
        uint64 matchId = matchOfAssertion[assertionId];
        Match storage m = _matches[matchId];
        if (m.assertionId != assertionId) return; // not the pending one (cannot happen, but never act twice)

        Result asserted = m.asserted;
        m.assertionId = bytes32(0);
        m.asserted = Result.None;
        // After RESULT_TIMEOUT bets refund, so a late confirmation must not change anything any more.
        if (assertedTruthfully && !_timedOut(m)) {
            m.result = asserted;
            emit ResultConfirmed(matchId, asserted);
        } else {
            emit ResultRejected(matchId, assertionId);
        }
    }

    /// @dev A dispute changes nothing here: the assertion stays pending until UMA's vote resolves it.
    function assertionDisputedCallback(bytes32) external view {
        if (msg.sender != address(oracle)) revert NotOracle();
    }

    function _timedOut(Match storage m) internal view returns (bool) {
        return block.timestamp > uint256(m.kickoff) + RESULT_TIMEOUT;
    }

    function _claim(uint64 matchId, Match storage m, Result result) internal view returns (bytes memory) {
        return abi.encodePacked(
            "Football match ",
            Strings.toString(matchId),
            " on football-data.org: ",
            m.home,
            " vs ",
            m.away,
            " (",
            m.competition,
            "), kickoff ",
            Strings.toString(m.kickoff),
            " (unix time). Result after regular time (90 minutes plus stoppage time, without extra time or penalties): ",
            _label(result),
            ". VOID means the match was cancelled, postponed or abandoned and not completed on that day."
        );
    }

    function _label(Result r) internal pure returns (string memory) {
        if (r == Result.Home) return "HOME WIN";
        if (r == Result.Draw) return "DRAW";
        if (r == Result.Away) return "AWAY WIN";
        return "VOID";
    }

    // ---------------------------------------------------------------- bets

    /// @notice Opens a bet on a match and pulls the stake (approve `stake` first).
    /// @param creatorPick Home, Draw or Away.
    /// @param quote Decimal quote for the creator's pick in hundredths (200 = 2.00 = equal stakes).
    ///        The taker's stake is stake × (quote − 1); the winner gets both stakes.
    /// @param invited Only this address may take the bet; 0 lets anyone with the link take it.
    function create(uint64 matchId, Pick creatorPick, uint96 stake, uint16 quote, address invited)
        external
        nonReentrant
        returns (uint256 id)
    {
        Match storage m = _matches[matchId];
        if (m.kickoff == 0) revert UnknownMatch();
        if (block.timestamp >= m.kickoff) revert TooLate();
        if (creatorPick == Pick.None) revert InvalidPick();
        if (stake == 0) revert InvalidStake();
        if (quote < MIN_QUOTE || quote > MAX_QUOTE) revert InvalidQuote();
        uint256 takerStake = (uint256(stake) * (quote - 100)) / 100;
        if (takerStake == 0 || takerStake > type(uint96).max) revert InvalidStake();
        if (invited == msg.sender) revert InvalidParticipants();

        id = ++betCount;
        Bet storage b = _bets[id];
        b.creator = msg.sender;
        b.creatorStake = stake;
        b.taker = invited;
        b.takerStake = uint96(takerStake);
        b.matchId = matchId;
        b.creatorPick = creatorPick;
        b.status = Status.Open;
        b.feeBps = feeBps;

        _betsOf[msg.sender].push(id);
        if (invited != address(0)) _betsOf[invited].push(id);

        emit BetCreated(id, matchId, msg.sender, invited);
        token.safeTransferFrom(msg.sender, address(this), stake);
    }

    /// @notice Takes the bet before kickoff on one of the two outcomes the creator left free, with
    ///         the taker stake set by the quote (approve `takerStake` first).
    function join(uint256 id, Pick takerPick) external nonReentrant {
        Bet storage b = _bets[id];
        if (b.status != Status.Open) revert WrongStatus();
        if (block.timestamp >= _matches[b.matchId].kickoff) revert TooLate();
        if (msg.sender == b.creator) revert NotAllowed();
        if (takerPick == Pick.None || takerPick == b.creatorPick) revert InvalidPick();
        if (b.taker == address(0)) {
            b.taker = msg.sender;
            _betsOf[msg.sender].push(id);
        } else if (b.taker != msg.sender) {
            revert NotAllowed();
        }
        b.takerPick = takerPick;
        b.status = Status.Active;

        emit BetJoined(id, msg.sender);
        token.safeTransferFrom(msg.sender, address(this), b.takerStake);
    }

    /// @notice Refunds an open bet nobody took. The creator can do this any time; after kickoff
    ///         anyone can trigger it (the money still goes to the creator).
    function cancel(uint256 id) external nonReentrant {
        Bet storage b = _bets[id];
        if (b.status != Status.Open) revert WrongStatus();
        if (msg.sender != b.creator && block.timestamp < _matches[b.matchId].kickoff) revert NotAllowed();
        b.status = Status.Cancelled;

        emit BetCancelled(id);
        token.safeTransfer(b.creator, b.creatorStake);
    }

    /// @notice Pays out a running bet once the result stands (or refunds after RESULT_TIMEOUT);
    ///         anyone can call.
    function settle(uint256 id) external nonReentrant {
        Bet storage b = _bets[id];
        if (b.status != Status.Active) revert WrongStatus();
        Payout payout = payoutOf(id);
        if (payout == Payout.None) revert TooEarly();

        b.status = Status.Settled;
        b.payout = payout;

        if (payout == Payout.Refund) {
            emit BetSettled(id, payout, 0, 0);
            token.safeTransfer(b.creator, b.creatorStake);
            token.safeTransfer(b.taker, b.takerStake);
            return;
        }

        uint256 pot = uint256(b.creatorStake) + b.takerStake;
        uint256 fee = (pot * b.feeBps) / 10_000;
        address winner = payout == Payout.Creator ? b.creator : b.taker;
        emit BetSettled(id, payout, pot - fee, fee);
        if (fee > 0) token.safeTransfer(feeRecipient, fee);
        token.safeTransfer(winner, pot - fee);
    }

    /// @notice What `settle` would do right now; None while the result is still open.
    function payoutOf(uint256 id) public view returns (Payout) {
        Bet storage b = _bets[id];
        if (b.status != Status.Active) return Payout.None;
        Match storage m = _matches[b.matchId];
        Result r = m.result;
        // No result stood in time: everyone gets their money back.
        if (r == Result.None) return _timedOut(m) ? Payout.Refund : Payout.None;
        if (r == Result.Void) return Payout.Refund;
        if (uint8(r) == uint8(b.creatorPick)) return Payout.Creator;
        if (uint8(r) == uint8(b.takerPick)) return Payout.Taker;
        return Payout.Refund; // the third outcome, which nobody picked
    }

    // ---------------------------------------------------------------- admin

    function setCurator(address curator_) external onlyOwner {
        curator = curator_;
        emit CuratorChanged(curator_);
    }

    /// @notice Fee for bets created from now on, taken from the winner's payout (not on refunds).
    function setFee(uint16 feeBps_, address feeRecipient_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS || (feeBps_ > 0 && feeRecipient_ == address(0))) revert InvalidFee();
        feeBps = feeBps_;
        feeRecipient = feeRecipient_;
        emit FeeChanged(feeBps_, feeRecipient_);
    }

    // ---------------------------------------------------------------- views

    function getMatch(uint64 matchId) external view returns (Match memory) {
        return _matches[matchId];
    }

    function matchCount() external view returns (uint256) {
        return _matchIds.length;
    }

    /// @notice Match ids in listing order, `count` of them starting at `start` (clamped to the end).
    function matchIds(uint256 start, uint256 count) external view returns (uint64[] memory ids) {
        uint256 end = start + count > _matchIds.length ? _matchIds.length : start + count;
        ids = new uint64[](end > start ? end - start : 0);
        for (uint256 i = start; i < end; i++) ids[i - start] = _matchIds[i];
    }

    function getBet(uint256 id) external view returns (Bet memory) {
        return _bets[id];
    }

    function betsOf(address user) external view returns (uint256[] memory) {
        return _betsOf[user];
    }
}
