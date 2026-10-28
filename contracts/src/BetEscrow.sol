// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BetEscrow
/// @notice Peer-to-peer bets between two people. The creator states a claim and stakes on it being
///         true; one taker stakes the same amount against it. The contract only holds the stakes:
///         there is no house, no odds and no pooled money.
///
/// How a bet ends:
///  - Both sides report the same outcome -> settled.
///  - A side reports the *other* side as winner (concession) -> settled at once.
///  - Reports conflict -> the arbiter both sides agreed on decides within ARBITER_WINDOW. Without
///    an arbiter, or if it stays silent, both get their stake back.
///  - `decideBy` passed and only one side reported -> that report counts. Nobody reported -> refund.
///  - Nobody joined by `joinBy` -> the creator gets the stake back.
///
/// The owner (a timelock) can only change the fee for future bets, capped at MAX_FEE_BPS. It cannot
/// move stakes or change running bets.
///
/// @dev Expects a plain ERC-20 without transfer fees or rebasing (USDC, the test token).
contract BetEscrow is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Open, // waiting for a taker
        Active, // both stakes in, waiting for reports
        Disputed, // reports conflict, waiting for the arbiter
        Settled,
        Cancelled // nobody joined, creator refunded
    }

    enum Outcome {
        None,
        Creator, // the claim was true
        Taker, // the claim was false
        Draw // nobody wins, both get their stake back
    }

    struct Bet {
        // slot 0
        address creator;
        uint40 joinBy;
        uint40 decideBy;
        Status status;
        Outcome outcome;
        // slot 1: invited opponent until someone joins (0 = anyone with the link), then the taker
        address taker;
        Outcome creatorReport;
        Outcome takerReport;
        uint40 disputedAt;
        uint16 feeBps; // fee at creation; later fee changes never touch running bets
        // slot 2
        address arbiter; // 0 = none
        uint96 stake; // per side
        // slot 3+
        string claim;
    }

    uint256 public constant MAX_CLAIM_LENGTH = 280; // bytes
    uint256 public constant MAX_DURATION = 365 days;
    uint256 public constant ARBITER_WINDOW = 7 days;
    uint256 public constant MAX_FEE_BPS = 200; // 2 % of the pot

    IERC20 public immutable token;

    uint16 public feeBps;
    address public feeRecipient;
    uint256 public betCount;

    mapping(uint256 id => Bet) internal _bets;
    /// Bets someone created, joined, was invited to or arbitrates.
    mapping(address user => uint256[]) internal _betsOf;

    /// Claim, stake and deadlines are in `getBet`.
    event BetCreated(uint256 indexed id, address indexed creator, address indexed invited, address arbiter);
    event BetJoined(uint256 indexed id, address indexed taker);
    event BetCancelled(uint256 indexed id);
    event Reported(uint256 indexed id, address indexed by, Outcome outcome);
    event Disputed(uint256 indexed id);
    event Settled(uint256 indexed id, Outcome outcome, uint256 payout, uint256 fee);
    event FeeChanged(uint16 feeBps, address feeRecipient);

    error InvalidStake();
    error InvalidClaim();
    error InvalidDeadlines();
    error InvalidParticipants();
    error InvalidOutcome();
    error InvalidFee();
    error WrongStatus();
    error NotAllowed();
    error TooLate();
    error TooEarly();
    error AlreadyReported();

    constructor(IERC20 token_, address owner_, uint16 feeBps_, address feeRecipient_) Ownable(owner_) {
        token = token_;
        _setFee(feeBps_, feeRecipient_);
    }

    // ---------------------------------------------------------------- bet lifecycle

    /// @notice Opens a bet and pulls the creator's stake (approve `stake` first).
    /// @param invited Only this address may take the bet; 0 lets anyone with the link take it.
    /// @param arbiter Decides if the two sides disagree; 0 = no arbiter (disagreement refunds both).
    function create(
        string calldata claim,
        address invited,
        address arbiter,
        uint96 stake,
        uint40 joinBy,
        uint40 decideBy
    ) external nonReentrant returns (uint256 id) {
        uint256 len = bytes(claim).length;
        if (len == 0 || len > MAX_CLAIM_LENGTH) revert InvalidClaim();
        if (stake == 0) revert InvalidStake();
        if (joinBy <= block.timestamp || decideBy <= joinBy || decideBy > block.timestamp + MAX_DURATION) {
            revert InvalidDeadlines();
        }
        if (invited == msg.sender || arbiter == msg.sender || (arbiter != address(0) && arbiter == invited)) {
            revert InvalidParticipants();
        }

        id = ++betCount;
        Bet storage b = _bets[id];
        b.creator = msg.sender;
        b.joinBy = joinBy;
        b.decideBy = decideBy;
        b.status = Status.Open;
        b.taker = invited;
        b.feeBps = feeBps;
        b.arbiter = arbiter;
        b.stake = stake;
        b.claim = claim;

        _betsOf[msg.sender].push(id);
        if (invited != address(0)) _betsOf[invited].push(id);
        if (arbiter != address(0)) _betsOf[arbiter].push(id);

        emit BetCreated(id, msg.sender, invited, arbiter);
        token.safeTransferFrom(msg.sender, address(this), stake);
    }

    /// @notice Takes the other side of an open bet and pulls the same stake (approve it first).
    function join(uint256 id) external nonReentrant {
        Bet storage b = _bets[id];
        if (b.status != Status.Open) revert WrongStatus();
        if (block.timestamp > b.joinBy) revert TooLate();
        if (msg.sender == b.creator || msg.sender == b.arbiter) revert NotAllowed();
        if (b.taker == address(0)) {
            b.taker = msg.sender;
            _betsOf[msg.sender].push(id);
        } else if (b.taker != msg.sender) {
            revert NotAllowed();
        }
        b.status = Status.Active;

        emit BetJoined(id, msg.sender);
        token.safeTransferFrom(msg.sender, address(this), b.stake);
    }

    /// @notice Refunds an open bet nobody took. The creator can do this any time; after `joinBy`
    ///         anyone can trigger it (the money still goes to the creator).
    function cancel(uint256 id) external nonReentrant {
        Bet storage b = _bets[id];
        if (b.status != Status.Open) revert WrongStatus();
        if (msg.sender != b.creator && block.timestamp <= b.joinBy) revert NotAllowed();
        b.status = Status.Cancelled;

        emit BetCancelled(id);
        token.safeTransfer(b.creator, b.stake);
    }

    /// @notice Each side reports the result once, by `decideBy`.
    function report(uint256 id, Outcome outcome) external nonReentrant {
        Bet storage b = _bets[id];
        if (b.status != Status.Active) revert WrongStatus();
        if (block.timestamp > b.decideBy) revert TooLate();
        if (outcome == Outcome.None) revert InvalidOutcome();

        Outcome other = Outcome.None;
        if (msg.sender == b.creator) {
            if (b.creatorReport != Outcome.None) revert AlreadyReported();
            b.creatorReport = outcome;
            other = b.takerReport;
            emit Reported(id, msg.sender, outcome);
            // Conceding needs no confirmation from the side that profits.
            if (outcome == Outcome.Taker) return _settle(id, b, Outcome.Taker);
        } else if (msg.sender == b.taker) {
            if (b.takerReport != Outcome.None) revert AlreadyReported();
            b.takerReport = outcome;
            other = b.creatorReport;
            emit Reported(id, msg.sender, outcome);
            if (outcome == Outcome.Creator) return _settle(id, b, Outcome.Creator);
        } else {
            revert NotAllowed();
        }

        if (other == Outcome.None) return;
        if (other == outcome) return _settle(id, b, outcome);

        // Conflicting reports.
        if (b.arbiter == address(0)) return _settle(id, b, Outcome.Draw);
        b.status = Status.Disputed;
        b.disputedAt = uint40(block.timestamp);
        emit Disputed(id);
    }

    /// @notice The arbiter's decision on a disputed bet, within ARBITER_WINDOW.
    function arbitrate(uint256 id, Outcome outcome) external nonReentrant {
        Bet storage b = _bets[id];
        if (b.status != Status.Disputed) revert WrongStatus();
        if (msg.sender != b.arbiter) revert NotAllowed();
        if (block.timestamp > uint256(b.disputedAt) + ARBITER_WINDOW) revert TooLate();
        if (outcome == Outcome.None) revert InvalidOutcome();
        _settle(id, b, outcome);
    }

    /// @notice Ends a bet whose deadline passed; anyone can call it.
    ///         Active after `decideBy`: the only report counts, no report refunds both.
    ///         Disputed after ARBITER_WINDOW: refunds both.
    function finalize(uint256 id) external nonReentrant {
        Bet storage b = _bets[id];
        if (b.status == Status.Active) {
            if (block.timestamp <= b.decideBy) revert TooEarly();
            // At most one side can have reported here: two reports always settle or dispute.
            Outcome result = b.creatorReport != Outcome.None
                ? b.creatorReport
                : b.takerReport != Outcome.None ? b.takerReport : Outcome.Draw;
            _settle(id, b, result);
        } else if (b.status == Status.Disputed) {
            if (block.timestamp <= uint256(b.disputedAt) + ARBITER_WINDOW) revert TooEarly();
            _settle(id, b, Outcome.Draw);
        } else {
            revert WrongStatus();
        }
    }

    function _settle(uint256 id, Bet storage b, Outcome outcome) internal {
        b.status = Status.Settled;
        b.outcome = outcome;

        if (outcome == Outcome.Draw) {
            emit Settled(id, outcome, b.stake, 0);
            token.safeTransfer(b.creator, b.stake);
            token.safeTransfer(b.taker, b.stake);
            return;
        }

        uint256 pot = uint256(b.stake) * 2;
        uint256 fee = (pot * b.feeBps) / 10_000;
        address winner = outcome == Outcome.Creator ? b.creator : b.taker;
        emit Settled(id, outcome, pot - fee, fee);
        if (fee > 0) token.safeTransfer(feeRecipient, fee);
        token.safeTransfer(winner, pot - fee);
    }

    // ---------------------------------------------------------------- admin

    /// @notice Fee for bets created from now on, taken from the winner's payout (not on refunds).
    function setFee(uint16 feeBps_, address feeRecipient_) external onlyOwner {
        _setFee(feeBps_, feeRecipient_);
    }

    function _setFee(uint16 feeBps_, address feeRecipient_) internal {
        if (feeBps_ > MAX_FEE_BPS || (feeBps_ > 0 && feeRecipient_ == address(0))) revert InvalidFee();
        feeBps = feeBps_;
        feeRecipient = feeRecipient_;
        emit FeeChanged(feeBps_, feeRecipient_);
    }

    // ---------------------------------------------------------------- views

    function getBet(uint256 id) external view returns (Bet memory) {
        return _bets[id];
    }

    function betsOf(address user) external view returns (uint256[] memory) {
        return _betsOf[user];
    }
}
