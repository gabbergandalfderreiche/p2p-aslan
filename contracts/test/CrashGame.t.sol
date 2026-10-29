// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CrashGame} from "../src/CrashGame.sol";
import {TestDollar} from "../src/TestDollar.sol";

contract CrashGameTest is Test {
    CrashGame game;
    TestDollar usd;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        vm.warp(1_800_000_000);
        vm.roll(1_000);
        usd = new TestDollar();
        game = new CrashGame(usd);
        usd.setMinter(address(game));
        vm.startPrank(alice);
        usd.faucet();
        usd.approve(address(game), type(uint256).max);
        vm.stopPrank();
    }

    /// Plays, mines the seed block with `hash` and returns the id and the crash point it will get.
    function _play(uint96 stake, uint32 target, bytes32 hash) internal returns (uint256 id, uint256 crash) {
        vm.prank(alice);
        id = game.play(stake, target);
        uint256 seedBlock = block.number + 1;
        vm.roll(seedBlock + 1);
        vm.setBlockhash(seedBlock, hash);
        crash = game.crashPoint(keccak256(abi.encode(hash, id, alice)));
    }

    function test_MinterOnlyOnceAndOnlyGame() public {
        vm.expectRevert(TestDollar.MinterSet.selector);
        usd.setMinter(bob);
        vm.expectRevert(TestDollar.NotMinter.selector);
        usd.mint(bob, 1);

        TestDollar fresh = new TestDollar();
        vm.expectRevert(TestDollar.NotMinter.selector);
        fresh.mint(bob, 1); // no minter yet
        vm.expectRevert(TestDollar.MinterSet.selector);
        vm.prank(bob);
        fresh.setMinter(bob); // not the deployer
    }

    function test_WinPaysStakeTimesTarget() public {
        // Find a seed that crashes at 2.00x or higher.
        bytes32 hash;
        uint256 crash;
        uint256 id;
        for (uint256 i = 1; ; i++) {
            hash = bytes32(i);
            crash = game.crashPoint(keccak256(abi.encode(hash, game.roundCount() + 1, alice)));
            if (crash >= 200) break;
        }
        (id, crash) = _play(10e6, 200, hash);
        uint256 before = usd.balanceOf(alice);
        vm.prank(bob);
        game.reveal(id);
        assertEq(usd.balanceOf(alice), before + 20e6);
        CrashGame.Round memory r = game.getRound(id);
        assertEq(uint8(r.state), uint8(CrashGame.State.Won));
        assertEq(r.crash, crash);
        (uint128 wagered, uint128 paidOut, uint32 rounds, uint32 wins, uint32 best) = game.stats(alice);
        assertEq(wagered, 10e6);
        assertEq(paidOut, 20e6);
        assertEq(rounds, 1);
        assertEq(wins, 1);
        assertEq(best, 200);
    }

    function test_LossKeepsStake() public {
        bytes32 hash;
        for (uint256 i = 1; ; i++) {
            hash = bytes32(i);
            if (game.crashPoint(keccak256(abi.encode(hash, game.roundCount() + 1, alice))) < 300) break;
        }
        (uint256 id,) = _play(10e6, 300, hash);
        uint256 before = usd.balanceOf(alice);
        game.reveal(id);
        assertEq(usd.balanceOf(alice), before);
        assertEq(uint8(game.getRound(id).state), uint8(CrashGame.State.Lost));
        assertEq(usd.balanceOf(address(game)), 10e6);
    }

    function test_RevealRules() public {
        vm.prank(alice);
        uint256 id = game.play(10e6, 200);
        vm.expectRevert(CrashGame.TooEarly.selector);
        game.reveal(id); // same block
        vm.roll(block.number + 1);
        vm.expectRevert(CrashGame.TooEarly.selector);
        game.reveal(id); // seed block not finished yet
        vm.roll(block.number + 1);
        game.reveal(id);
        vm.expectRevert(CrashGame.NotPending.selector);
        game.reveal(id);
    }

    function test_ExpiredRoundIsLost() public {
        vm.prank(alice);
        uint256 id = game.play(10e6, 101);
        vm.roll(block.number + 2 + game.REVEAL_WINDOW());
        game.reveal(id);
        CrashGame.Round memory r = game.getRound(id);
        assertEq(uint8(r.state), uint8(CrashGame.State.Lost));
        assertEq(r.crash, 0);
    }

    function test_Bounds() public {
        vm.startPrank(alice);
        vm.expectRevert(CrashGame.InvalidStake.selector);
        game.play(99_999, 200);
        vm.expectRevert(CrashGame.InvalidStake.selector);
        game.play(100e6 + 1, 200);
        vm.expectRevert(CrashGame.InvalidTarget.selector);
        game.play(10e6, 100);
        vm.expectRevert(CrashGame.InvalidTarget.selector);
        game.play(10e6, 100_001);
        vm.stopPrank();
    }

    /// The crash point is never below 1.00x, and the 1 in 101 bust always gives exactly 1.00x.
    function testFuzz_CrashPointRange(bytes32 seed) public view {
        uint256 c = game.crashPoint(seed);
        assertGe(c, 100);
        assertLe(c, 100_000_000);
        if (uint256(seed) % 101 == 0) assertEq(c, 100);
    }

    /// Roughly half of all rounds reach 2.00x (0.99 / 2 ≈ 49.5 %).
    function test_DistributionNearExpected() public view {
        uint256 reach2;
        uint256 n = 4000;
        for (uint256 i; i < n; i++) {
            if (game.crashPoint(keccak256(abi.encode(i))) >= 200) reach2++;
        }
        assertGt(reach2, (n * 46) / 100);
        assertLt(reach2, (n * 53) / 100);
    }
}
