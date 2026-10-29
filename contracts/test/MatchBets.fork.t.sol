// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MatchBets} from "../src/MatchBets.sol";
import {TestDollar} from "../src/TestDollar.sol";
import {IOptimisticOracleV3} from "../src/interfaces/IOptimisticOracleV3.sol";
import {UmaBaseSepolia} from "../script/UmaAddresses.sol";

interface ITestnetERC20 {
    function allocateTo(address to, uint256 amount) external;
}

/// @notice Runs against the real UMA Optimistic Oracle V3 on a fork of Base Sepolia.
///   forge test --match-contract MatchBetsForkTest
contract MatchBetsForkTest is Test {
    MatchBets bets;
    TestDollar usd;
    address bot = makeAddr("bot");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    uint64 constant MATCH = 537_001;

    function setUp() public {
        vm.createSelectFork("base_sepolia");
        usd = new TestDollar();
        bets = new MatchBets(
            usd,
            IOptimisticOracleV3(UmaBaseSepolia.OPTIMISTIC_ORACLE_V3),
            IERC20(UmaBaseSepolia.BOND_CURRENCY),
            100e18,
            2 hours,
            address(this),
            address(this)
        );
        bets.addMatch(MATCH, uint40(block.timestamp + 1 hours), "FC Bayern", "Borussia Dortmund", "Bundesliga");

        ITestnetERC20(UmaBaseSepolia.BOND_CURRENCY).allocateTo(bot, 100e18);
        vm.prank(bot);
        IERC20(UmaBaseSepolia.BOND_CURRENCY).approve(address(bets), 100e18);
        for (uint256 i; i < 2; i++) {
            address u = i == 0 ? alice : bob;
            vm.startPrank(u);
            usd.faucet();
            usd.approve(address(bets), type(uint256).max);
            vm.stopPrank();
        }
    }

    function test_RealOracleConfirmsResultAndBetPays() public {
        vm.prank(alice);
        uint256 id = bets.create(MATCH, MatchBets.Pick.Home, 10e6, 200, address(0));
        vm.prank(bob);
        bets.join(id, MatchBets.Pick.Away);

        vm.warp(block.timestamp + 3 hours);
        vm.prank(bot);
        bets.assertResult(MATCH, MatchBets.Result.Home);
        vm.warp(block.timestamp + 2 hours);
        bets.settleResult(MATCH);

        assertEq(uint8(bets.getMatch(MATCH).result), uint8(MatchBets.Result.Home));
        assertEq(IERC20(UmaBaseSepolia.BOND_CURRENCY).balanceOf(bot), 100e18); // bond back

        uint256 before = usd.balanceOf(alice);
        bets.settle(id);
        assertEq(usd.balanceOf(alice), before + 20e6);
    }
}
