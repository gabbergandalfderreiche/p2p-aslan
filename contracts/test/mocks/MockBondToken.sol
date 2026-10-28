// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Bond token for tests and the local node; same mint function as UMA's TestnetERC20.
contract MockBondToken is ERC20 {
    constructor() ERC20("Mock bond", "BOND") {}

    function allocateTo(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
