// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice UMA contracts on Base Sepolia, from UMAprotocol/protocol packages/core/networks/84532.json
///         (checked onchain Oct 2026: defaultLiveness 2h, minimum bond 0, ASSERT_TRUTH identifier).
library UmaBaseSepolia {
    address internal constant OPTIMISTIC_ORACLE_V3 = 0x0F7fC5E6482f096380db6158f978167b57388deE;
    /// UMA's TestnetERC20 (18 decimals, anyone can mint with allocateTo); the oracle's default currency.
    address internal constant BOND_CURRENCY = 0x7E6d9618Ba8a87421609352d6e711958A97e2512;
}
