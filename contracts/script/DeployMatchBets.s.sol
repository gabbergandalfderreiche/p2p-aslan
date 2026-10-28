// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MatchBets} from "../src/MatchBets.sol";
import {IOptimisticOracleV3} from "../src/interfaces/IOptimisticOracleV3.sol";

/// @notice Replaces only MatchBets in an existing deployment (same token, timelock, oracle and bond
///         currency) and updates deployments/<chainId>.json. Bets on the old contract stay there.
///
/// Usage:
///   CURATOR=0x... forge script script/DeployMatchBets.s.sol --rpc-url base_sepolia --broadcast --account <keystore>
contract DeployMatchBets is Script {
    uint256 constant BOND = 100e18;
    uint64 constant LIVENESS = 2 hours;
    uint64 constant LOCAL_LIVENESS = 60;

    error UnsupportedChain(uint256 chainId);

    function run() external returns (MatchBets bets) {
        if (block.chainid != 84532 && block.chainid != 31337) revert UnsupportedChain(block.chainid);
        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(path);
        address token = vm.parseJsonAddress(json, ".token");
        address timelock = vm.parseJsonAddress(json, ".timelock");
        address oracle = vm.parseJsonAddress(json, ".oracle");
        address bondCurrency = vm.parseJsonAddress(json, ".bondCurrency");
        address curator = vm.envAddress("CURATOR");

        vm.startBroadcast();
        bets = new MatchBets(
            IERC20(token),
            IOptimisticOracleV3(oracle),
            IERC20(bondCurrency),
            BOND,
            block.chainid == 31337 ? LOCAL_LIVENESS : LIVENESS,
            timelock,
            curator
        );
        vm.stopBroadcast();

        require(bets.owner() == timelock && bets.curator() == curator && bets.feeBps() == 0, "setup check failed");
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) {
            console.log("Dry run - deployments file not written");
            return bets;
        }

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "block", vm.parseJsonUint(json, ".block"));
        vm.serializeAddress(k, "admin", vm.parseJsonAddress(json, ".admin"));
        vm.serializeAddress(k, "token", token);
        vm.serializeAddress(k, "timelock", timelock);
        vm.serializeAddress(k, "escrow", vm.parseJsonAddress(json, ".escrow"));
        vm.serializeAddress(k, "oracle", oracle);
        vm.serializeAddress(k, "bondCurrency", bondCurrency);
        vm.serializeAddress(k, "matchBetsPrevious", vm.parseJsonAddress(json, ".matchBets"));
        string memory out = vm.serializeAddress(k, "matchBets", address(bets));
        vm.writeJson(out, path);
        console.log("MatchBets replaced, written to", path);
    }
}
