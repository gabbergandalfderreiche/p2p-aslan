// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title TestDollar
/// @notice Play money for the testnet beta. Worthless by design: anyone can get FAUCET_AMOUNT once
///         per FAUCET_COOLDOWN from the faucet. 6 decimals like USDC, so the app can switch to real
///         USDC later without changing amounts.
/// @dev `minter` (the crash game) may create tUSD to pay out winnings. The deployer sets it once
///      right after deployment; after that nobody can change it.
contract TestDollar is ERC20 {
    uint256 public constant FAUCET_AMOUNT = 100e6; // 100 tUSD
    uint256 public constant FAUCET_COOLDOWN = 1 days;

    address public minter;
    address internal immutable _deployer;
    mapping(address user => uint256) public lastClaim;

    error FaucetCooldown(uint256 availableAt);
    error NotMinter();
    error MinterSet();

    constructor() ERC20("Test Dollar (no real value)", "tUSD") {
        _deployer = msg.sender;
    }

    /// @notice One-time: lets the crash game mint winnings. Only the deployer, only once.
    function setMinter(address minter_) external {
        if (msg.sender != _deployer || minter != address(0)) revert MinterSet();
        minter = minter_;
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet() external {
        uint256 availableAt = lastClaim[msg.sender] + FAUCET_COOLDOWN;
        if (lastClaim[msg.sender] != 0 && block.timestamp < availableAt) revert FaucetCooldown(availableAt);
        lastClaim[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != minter || minter == address(0)) revert NotMinter();
        _mint(to, amount);
    }
}
