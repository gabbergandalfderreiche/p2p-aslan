// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IOptimisticOracleV3CallbackRecipient} from "../../src/interfaces/IOptimisticOracleV3.sol";

/// @notice Stand-in for UMA's Optimistic Oracle V3 in tests and on the local anvil node.
///         Same money flow (bond pulled from the caller, returned to the asserter) and callbacks;
///         a dispute is resolved by whoever calls `resolveDispute` (UMA's voters on mainnet).
contract MockOptimisticOracleV3 {
    using SafeERC20 for IERC20;

    struct Assertion {
        address asserter;
        address disputer;
        address callback;
        IERC20 currency;
        uint256 bond;
        uint64 expiresAt;
        bool settled;
    }

    uint256 public minimumBond;
    uint256 internal _nonce;
    mapping(bytes32 => Assertion) public assertions;
    mapping(bytes32 => bytes) public claims;

    constructor(uint256 minimumBond_) {
        minimumBond = minimumBond_;
    }

    function defaultIdentifier() external pure returns (bytes32) {
        return "ASSERT_TRUTH";
    }

    function getMinimumBond(address) external view returns (uint256) {
        return minimumBond;
    }

    function assertTruth(
        bytes memory claim,
        address asserter,
        address callbackRecipient,
        address,
        uint64 liveness,
        IERC20 currency,
        uint256 bond,
        bytes32,
        bytes32
    ) external returns (bytes32 id) {
        require(bond >= minimumBond, "bond too low");
        id = keccak256(abi.encode(++_nonce, claim));
        assertions[id] = Assertion(asserter, address(0), callbackRecipient, currency, bond, uint64(block.timestamp) + liveness, false);
        claims[id] = claim;
        currency.safeTransferFrom(msg.sender, address(this), bond);
    }

    function disputeAssertion(bytes32 id, address disputer) external {
        Assertion storage a = assertions[id];
        require(a.asserter != address(0) && !a.settled && a.disputer == address(0), "cannot dispute");
        require(block.timestamp < a.expiresAt, "expired");
        a.disputer = disputer;
        a.currency.safeTransferFrom(msg.sender, address(this), a.bond);
        IOptimisticOracleV3CallbackRecipient(a.callback).assertionDisputedCallback(id);
    }

    /// Undisputed after liveness -> truthful.
    function settleAssertion(bytes32 id) external {
        Assertion storage a = assertions[id];
        require(a.asserter != address(0) && !a.settled && a.disputer == address(0), "cannot settle");
        require(block.timestamp >= a.expiresAt, "not expired");
        a.settled = true;
        a.currency.safeTransfer(a.asserter, a.bond);
        IOptimisticOracleV3CallbackRecipient(a.callback).assertionResolvedCallback(id, true);
    }

    /// Plays UMA's vote on a disputed assertion; the winner takes both bonds.
    function resolveDispute(bytes32 id, bool assertedTruthfully) external {
        Assertion storage a = assertions[id];
        require(a.disputer != address(0) && !a.settled, "not disputed");
        a.settled = true;
        a.currency.safeTransfer(assertedTruthfully ? a.asserter : a.disputer, a.bond * 2);
        IOptimisticOracleV3CallbackRecipient(a.callback).assertionResolvedCallback(id, assertedTruthfully);
    }
}
