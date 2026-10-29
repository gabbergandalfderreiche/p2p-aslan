// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TestDollar} from "./TestDollar.sol";

/// @title CrashGame
/// @notice Play-money crash game against the house ("Löwensprung"), testnet only.
///
/// A round: the player stakes tUSD and picks an auto cash-out (e.g. 2.00x). The crash point comes
/// from the hash of the block after the stake, so nobody knows it when betting. If the crash point
/// reaches the cash-out, the player gets stake × cash-out (minted as new tUSD), otherwise the stake
/// is lost. About 1 % of rounds crash at 1.00x (the house edge); otherwise P(crash ≥ x) ≈ 0.99 / x.
///
/// Anyone can reveal a round (our server does it right after the bet). A round not revealed within
/// REVEAL_WINDOW blocks counts as lost, so waiting to see the outcome never helps.
///
/// @dev Block hashes on an L2 come from a single sequencer: fine for worthless play money, not for
///      real stakes.
contract CrashGame is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        None,
        Pending,
        Won,
        Lost
    }

    struct Round {
        address player;
        uint96 stake;
        uint64 betBlock;
        uint32 target; // auto cash-out in hundredths (200 = 2.00x)
        uint32 crash; // crash point in hundredths, 0 while pending or when expired
        State state;
    }

    struct Stats {
        uint128 wagered;
        uint128 paidOut;
        uint32 rounds;
        uint32 wins;
        uint32 bestWin; // highest cash-out that won, in hundredths
    }

    uint256 public constant MIN_TARGET = 101; // 1.01x
    uint256 public constant MAX_TARGET = 100_000; // 1000x
    uint256 public constant MIN_STAKE = 100_000; // 0.1 tUSD
    uint256 public constant MAX_STAKE = 100e6; // 100 tUSD
    uint256 public constant REVEAL_WINDOW = 250; // blocks; blockhash only reaches back 256
    uint256 internal constant MAX_CRASH = 100_000_000; // 1,000,000x cap

    TestDollar public immutable token;
    uint256 public roundCount;

    mapping(uint256 id => Round) internal _rounds;
    mapping(address player => uint256[]) internal _roundsOf;
    mapping(address player => Stats) public stats;

    event Played(uint256 indexed id, address indexed player, uint256 stake, uint256 target);
    event Revealed(uint256 indexed id, address indexed player, uint256 crash, bool won, uint256 payout);

    error InvalidStake();
    error InvalidTarget();
    error NotPending();
    error TooEarly();

    constructor(TestDollar token_) {
        token = token_;
    }

    /// @notice Stakes `stake` (approve it first) with an auto cash-out of `target` hundredths.
    function play(uint96 stake, uint32 target) external nonReentrant returns (uint256 id) {
        if (stake < MIN_STAKE || stake > MAX_STAKE) revert InvalidStake();
        if (target < MIN_TARGET || target > MAX_TARGET) revert InvalidTarget();

        id = ++roundCount;
        _rounds[id] = Round(msg.sender, stake, uint64(block.number), target, 0, State.Pending);
        _roundsOf[msg.sender].push(id);
        emit Played(id, msg.sender, stake, target);
        IERC20(address(token)).safeTransferFrom(msg.sender, address(this), stake);
    }

    /// @notice Decides a round once the next block exists; anyone can call.
    function reveal(uint256 id) external nonReentrant {
        Round storage r = _rounds[id];
        if (r.state != State.Pending) revert NotPending();
        uint256 seedBlock = uint256(r.betBlock) + 1;
        if (block.number <= seedBlock) revert TooEarly();

        Stats storage s = stats[r.player];
        s.rounds += 1;
        s.wagered += r.stake;

        if (block.number > seedBlock + REVEAL_WINDOW) {
            r.state = State.Lost; // expired: the hash is gone, the round counts as lost
            emit Revealed(id, r.player, 0, false, 0);
            return;
        }

        uint256 crash = crashPoint(keccak256(abi.encode(blockhash(seedBlock), id, r.player)));
        r.crash = uint32(crash);
        if (crash < r.target) {
            r.state = State.Lost;
            emit Revealed(id, r.player, crash, false, 0);
            return;
        }

        uint256 payout = (uint256(r.stake) * r.target) / 100;
        r.state = State.Won;
        s.wins += 1;
        s.paidOut += uint128(payout);
        if (r.target > s.bestWin) s.bestWin = r.target;
        emit Revealed(id, r.player, crash, true, payout);
        token.mint(r.player, payout);
    }

    /// @notice Crash point in hundredths from a seed: 1 in 101 rounds bust at 1.00x, otherwise
    ///         P(crash ≥ x) = 1 / x for the remaining rounds.
    function crashPoint(bytes32 seed) public pure returns (uint256) {
        uint256 n = uint256(seed);
        if (n % 101 == 0) return 100;
        uint256 e = 2 ** 52;
        uint256 h = n >> 204; // top 52 bits, uniform in [0, e)
        uint256 crash = (100 * e - h) / (e - h);
        return crash > MAX_CRASH ? MAX_CRASH : crash;
    }

    function getRound(uint256 id) external view returns (Round memory) {
        return _rounds[id];
    }

    function roundsOf(address player) external view returns (uint256[] memory) {
        return _roundsOf[player];
    }
}
