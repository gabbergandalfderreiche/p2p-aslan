// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestDollar
/// @notice Play money for the testnet beta. Worthless by design: anyone can get FAUCET_AMOUNT once
///         per FAUCET_COOLDOWN from the faucet. 6 decimals like USDC, so the app can switch to real
///         USDC later without changing amounts.
contract TestDollar is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 100e6; // 100 tUSD
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    mapping(address user => uint256) public lastClaim;

    error FaucetCooldown(uint256 availableAt);

    constructor() ERC20("Test Dollar (no real value)", "tUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        uint256 availableAt = lastClaim[msg.sender] + FAUCET_COOLDOWN;
        if (lastClaim[msg.sender] != 0 && block.timestamp < availableAt) revert FaucetCooldown(availableAt);
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
