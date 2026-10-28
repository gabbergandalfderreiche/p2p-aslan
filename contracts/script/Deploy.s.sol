// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {BetEscrow} from "../src/BetEscrow.sol";
import {TestDollar} from "../src/TestDollar.sol";

/// @notice Deploys the testnet beta: TestDollar (play money), a TimelockController and BetEscrow.
///
/// End state, checked at the end of `deploy`:
///  - TimelockController: only ADMIN can propose/execute/cancel, no admin can bypass the delay.
///  - BetEscrow owner = timelock, fee 0 %.
///  - The deployer keeps no rights anywhere.
///
/// Usage:
///   ADMIN=0x... forge script script/Deploy.s.sol --rpc-url base_sepolia --broadcast --account <keystore-name>
/// Set TOKEN=0x... to use an existing token (e.g. USDC) instead of deploying TestDollar.
contract Deploy is Script {
    uint256 constant BASE_SEPOLIA = 84532;
    uint256 constant LOCAL = 31337;

    struct Deployment {
        IERC20 token;
        TimelockController timelock;
        BetEscrow escrow;
    }

    error UnsupportedChain(uint256 chainId);
    error SetupCheckFailed(string what);

    function run() external returns (Deployment memory d) {
        // Testnet only for now: real money needs a legal review first.
        if (block.chainid != BASE_SEPOLIA && block.chainid != LOCAL) revert UnsupportedChain(block.chainid);
        address admin = vm.envAddress("ADMIN");
        uint256 delay = vm.envOr("TIMELOCK_DELAY", uint256(2 days));
        address token = vm.envOr("TOKEN", address(0));

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        d = deploy(admin, delay, token, deployer);
        vm.stopBroadcast();
        // A dry run must not leave a deployment file behind: the frontend would treat simulated
        // addresses as real ones.
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) _write(d, admin);
        else console.log("Dry run - deployments file not written");
    }

    function deploy(address admin, uint256 delay, address token, address deployer)
        public
        returns (Deployment memory d)
    {
        d.token = token == address(0) ? IERC20(address(new TestDollar())) : IERC20(token);

        address[] memory roles = new address[](1);
        roles[0] = admin;
        d.timelock = new TimelockController(delay, roles, roles, address(0));
        d.escrow = new BetEscrow(d.token, address(d.timelock), 0, address(0));

        _check(d, admin, delay, deployer);
    }

    function _check(Deployment memory d, address admin, uint256 delay, address deployer) internal view {
        TimelockController t = d.timelock;
        if (t.getMinDelay() != delay) revert SetupCheckFailed("timelock delay");
        if (!t.hasRole(t.PROPOSER_ROLE(), admin) || !t.hasRole(t.EXECUTOR_ROLE(), admin)) {
            revert SetupCheckFailed("timelock roles");
        }
        if (t.hasRole(t.DEFAULT_ADMIN_ROLE(), deployer) && deployer != address(t)) {
            revert SetupCheckFailed("deployer is timelock admin");
        }
        if (d.escrow.owner() != address(t)) revert SetupCheckFailed("escrow owner");
        if (d.escrow.feeBps() != 0) revert SetupCheckFailed("fee");
    }

    function _write(Deployment memory d, address admin) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "block", block.number);
        vm.serializeAddress(k, "admin", admin);
        vm.serializeAddress(k, "token", address(d.token));
        vm.serializeAddress(k, "timelock", address(d.timelock));
        string memory json = vm.serializeAddress(k, "escrow", address(d.escrow));

        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("Deployment written to", path);
    }
}
