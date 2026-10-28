// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {BetEscrow} from "../src/BetEscrow.sol";
import {TestDollar} from "../src/TestDollar.sol";

contract BetEscrowTest is Test {
    BetEscrow escrow;
    TestDollar usd;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice"); // creator
    address bob = makeAddr("bob"); // taker
    address carol = makeAddr("carol"); // arbiter
    address dave = makeAddr("dave"); // outsider

    uint96 constant STAKE = 10e6;
    uint40 joinBy;
    uint40 decideBy;

    function setUp() public {
        usd = new TestDollar();
        escrow = new BetEscrow(usd, owner, 0, address(0));
        joinBy = uint40(block.timestamp + 1 days);
        decideBy = uint40(block.timestamp + 7 days);
        address[4] memory users = [alice, bob, carol, dave];
        for (uint256 i; i < users.length; i++) {
            vm.startPrank(users[i]);
            usd.faucet();
            usd.approve(address(escrow), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _create(address invited, address arbiter) internal returns (uint256) {
        vm.prank(alice);
        return escrow.create("FCZ wins on Sunday", invited, arbiter, STAKE, joinBy, decideBy);
    }

    function _active(address arbiter) internal returns (uint256 id) {
        id = _create(address(0), arbiter);
        vm.prank(bob);
        escrow.join(id);
    }

    function _report(address who, uint256 id, BetEscrow.Outcome o) internal {
        vm.prank(who);
        escrow.report(id, o);
    }

    // ---------------------------------------------------------------- create / join / cancel

    function test_CreateStoresBetAndPullsStake() public {
        uint256 id = _create(bob, carol);
        BetEscrow.Bet memory b = escrow.getBet(id);
        assertEq(id, 1);
        assertEq(b.creator, alice);
        assertEq(b.taker, bob);
        assertEq(b.arbiter, carol);
        assertEq(b.stake, STAKE);
        assertEq(b.claim, "FCZ wins on Sunday");
        assertEq(uint8(b.status), uint8(BetEscrow.Status.Open));
        assertEq(usd.balanceOf(address(escrow)), STAKE);
        assertEq(escrow.betsOf(alice).length, 1);
        assertEq(escrow.betsOf(bob)[0], id);
        assertEq(escrow.betsOf(carol)[0], id);
    }

    function test_CreateRejectsBadInput() public {
        vm.startPrank(alice);
        vm.expectRevert(BetEscrow.InvalidClaim.selector);
        escrow.create("", address(0), address(0), STAKE, joinBy, decideBy);
        vm.expectRevert(BetEscrow.InvalidClaim.selector);
        escrow.create(string(new bytes(281)), address(0), address(0), STAKE, joinBy, decideBy);
        vm.expectRevert(BetEscrow.InvalidStake.selector);
        escrow.create("x", address(0), address(0), 0, joinBy, decideBy);
        vm.expectRevert(BetEscrow.InvalidDeadlines.selector);
        escrow.create("x", address(0), address(0), STAKE, uint40(block.timestamp), decideBy);
        vm.expectRevert(BetEscrow.InvalidDeadlines.selector);
        escrow.create("x", address(0), address(0), STAKE, joinBy, joinBy);
        vm.expectRevert(BetEscrow.InvalidDeadlines.selector);
        escrow.create("x", address(0), address(0), STAKE, joinBy, uint40(block.timestamp + 366 days));
        vm.expectRevert(BetEscrow.InvalidParticipants.selector);
        escrow.create("x", alice, address(0), STAKE, joinBy, decideBy);
        vm.expectRevert(BetEscrow.InvalidParticipants.selector);
        escrow.create("x", address(0), alice, STAKE, joinBy, decideBy);
        vm.expectRevert(BetEscrow.InvalidParticipants.selector);
        escrow.create("x", bob, bob, STAKE, joinBy, decideBy);
        vm.stopPrank();
    }

    function test_JoinOpenBet() public {
        uint256 id = _create(address(0), carol);
        vm.prank(bob);
        escrow.join(id);
        BetEscrow.Bet memory b = escrow.getBet(id);
        assertEq(b.taker, bob);
        assertEq(uint8(b.status), uint8(BetEscrow.Status.Active));
        assertEq(usd.balanceOf(address(escrow)), 2 * STAKE);
        assertEq(escrow.betsOf(bob)[0], id);
    }

    function test_JoinRules() public {
        uint256 id = _create(bob, carol);
        vm.expectRevert(BetEscrow.NotAllowed.selector);
        vm.prank(dave);
        escrow.join(id);
        vm.expectRevert(BetEscrow.NotAllowed.selector);
        vm.prank(alice);
        escrow.join(id);

        uint256 open = _create(address(0), carol);
        vm.expectRevert(BetEscrow.NotAllowed.selector);
        vm.prank(carol);
        escrow.join(open);

        vm.warp(joinBy + 1);
        vm.expectRevert(BetEscrow.TooLate.selector);
        vm.prank(bob);
        escrow.join(id);
    }

    function test_JoinOnlyOnce() public {
        uint256 id = _active(address(0));
        vm.expectRevert(BetEscrow.WrongStatus.selector);
        vm.prank(dave);
        escrow.join(id);
    }

    function test_CreatorCancelsAnyTime() public {
        uint256 id = _create(address(0), address(0));
        uint256 before = usd.balanceOf(alice);
        vm.prank(alice);
        escrow.cancel(id);
        assertEq(usd.balanceOf(alice), before + STAKE);
        assertEq(uint8(escrow.getBet(id).status), uint8(BetEscrow.Status.Cancelled));
    }

    function test_AnyoneRefundsCreatorAfterJoinDeadline() public {
        uint256 id = _create(address(0), address(0));
        vm.expectRevert(BetEscrow.NotAllowed.selector);
        vm.prank(dave);
        escrow.cancel(id);

        vm.warp(joinBy + 1);
        uint256 before = usd.balanceOf(alice);
        vm.prank(dave);
        escrow.cancel(id);
        assertEq(usd.balanceOf(alice), before + STAKE);
    }

    function test_CannotCancelActiveBet() public {
        uint256 id = _active(address(0));
        vm.expectRevert(BetEscrow.WrongStatus.selector);
        vm.prank(alice);
        escrow.cancel(id);
    }

    // ---------------------------------------------------------------- reports

    function test_BothAgree() public {
        uint256 id = _active(address(0));
        _report(alice, id, BetEscrow.Outcome.Creator);
        assertEq(uint8(escrow.getBet(id).status), uint8(BetEscrow.Status.Active));
        uint256 before = usd.balanceOf(alice);
        _report(bob, id, BetEscrow.Outcome.Creator);
        assertEq(usd.balanceOf(alice), before + 2 * STAKE);
        assertEq(uint8(escrow.getBet(id).outcome), uint8(BetEscrow.Outcome.Creator));
        assertEq(usd.balanceOf(address(escrow)), 0);
    }

    function test_ConcessionSettlesAtOnce() public {
        uint256 id = _active(address(0));
        uint256 before = usd.balanceOf(bob);
        _report(alice, id, BetEscrow.Outcome.Taker);
        assertEq(usd.balanceOf(bob), before + 2 * STAKE);
        assertEq(uint8(escrow.getBet(id).status), uint8(BetEscrow.Status.Settled));
    }

    function test_BothAgreeOnDraw() public {
        uint256 id = _active(address(0));
        uint256 a = usd.balanceOf(alice);
        uint256 b = usd.balanceOf(bob);
        _report(alice, id, BetEscrow.Outcome.Draw);
        _report(bob, id, BetEscrow.Outcome.Draw);
        assertEq(usd.balanceOf(alice), a + STAKE);
        assertEq(usd.balanceOf(bob), b + STAKE);
    }

    function test_ReportRules() public {
        uint256 id = _active(address(0));
        vm.expectRevert(BetEscrow.NotAllowed.selector);
        _report(dave, id, BetEscrow.Outcome.Creator);
        vm.expectRevert(BetEscrow.InvalidOutcome.selector);
        _report(alice, id, BetEscrow.Outcome.None);
        _report(alice, id, BetEscrow.Outcome.Creator);
        vm.expectRevert(BetEscrow.AlreadyReported.selector);
        _report(alice, id, BetEscrow.Outcome.Draw);

        vm.warp(decideBy + 1);
        vm.expectRevert(BetEscrow.TooLate.selector);
        _report(bob, id, BetEscrow.Outcome.Taker);
    }

    function test_ConflictWithoutArbiterRefundsBoth() public {
        uint256 id = _active(address(0));
        uint256 a = usd.balanceOf(alice);
        uint256 b = usd.balanceOf(bob);
        _report(alice, id, BetEscrow.Outcome.Creator);
        _report(bob, id, BetEscrow.Outcome.Taker);
        assertEq(uint8(escrow.getBet(id).outcome), uint8(BetEscrow.Outcome.Draw));
        assertEq(usd.balanceOf(alice), a + STAKE);
        assertEq(usd.balanceOf(bob), b + STAKE);
    }

    // ---------------------------------------------------------------- disputes

    function test_ArbiterDecidesDispute() public {
        uint256 id = _active(carol);
        _report(bob, id, BetEscrow.Outcome.Taker);
        _report(alice, id, BetEscrow.Outcome.Creator);
        assertEq(uint8(escrow.getBet(id).status), uint8(BetEscrow.Status.Disputed));

        vm.expectRevert(BetEscrow.NotAllowed.selector);
        vm.prank(alice);
        escrow.arbitrate(id, BetEscrow.Outcome.Creator);

        uint256 before = usd.balanceOf(bob);
        vm.prank(carol);
        escrow.arbitrate(id, BetEscrow.Outcome.Taker);
        assertEq(usd.balanceOf(bob), before + 2 * STAKE);
    }

    function test_SilentArbiterRefundsBoth() public {
        uint256 id = _active(carol);
        _report(alice, id, BetEscrow.Outcome.Creator);
        _report(bob, id, BetEscrow.Outcome.Taker);

        vm.expectRevert(BetEscrow.TooEarly.selector);
        escrow.finalize(id);

        vm.warp(block.timestamp + escrow.ARBITER_WINDOW() + 1);
        vm.expectRevert(BetEscrow.TooLate.selector);
        vm.prank(carol);
        escrow.arbitrate(id, BetEscrow.Outcome.Creator);

        uint256 a = usd.balanceOf(alice);
        uint256 b = usd.balanceOf(bob);
        vm.prank(dave);
        escrow.finalize(id);
        assertEq(usd.balanceOf(alice), a + STAKE);
        assertEq(usd.balanceOf(bob), b + STAKE);
    }

    function test_ArbitrateOnlyWhenDisputed() public {
        uint256 id = _active(carol);
        vm.expectRevert(BetEscrow.WrongStatus.selector);
        vm.prank(carol);
        escrow.arbitrate(id, BetEscrow.Outcome.Creator);
    }

    // ---------------------------------------------------------------- deadlines

    function test_SingleReportCountsAfterDeadline() public {
        uint256 id = _active(address(0));
        _report(bob, id, BetEscrow.Outcome.Taker);

        vm.expectRevert(BetEscrow.TooEarly.selector);
        escrow.finalize(id);

        vm.warp(decideBy + 1);
        uint256 before = usd.balanceOf(bob);
        vm.prank(dave);
        escrow.finalize(id);
        assertEq(usd.balanceOf(bob), before + 2 * STAKE);
    }

    function test_NoReportRefundsAfterDeadline() public {
        uint256 id = _active(address(0));
        vm.warp(decideBy + 1);
        uint256 a = usd.balanceOf(alice);
        uint256 b = usd.balanceOf(bob);
        escrow.finalize(id);
        assertEq(usd.balanceOf(alice), a + STAKE);
        assertEq(usd.balanceOf(bob), b + STAKE);
    }

    function test_FinalizeWrongStatus() public {
        uint256 id = _create(address(0), address(0));
        vm.expectRevert(BetEscrow.WrongStatus.selector);
        escrow.finalize(id);
    }

    // ---------------------------------------------------------------- fees

    function test_FeeOnlyByOwnerAndCapped() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        escrow.setFee(100, treasury);

        vm.startPrank(owner);
        vm.expectRevert(BetEscrow.InvalidFee.selector);
        escrow.setFee(201, treasury);
        vm.expectRevert(BetEscrow.InvalidFee.selector);
        escrow.setFee(100, address(0));
        escrow.setFee(100, treasury);
        vm.stopPrank();
        assertEq(escrow.feeBps(), 100);
    }

    function test_FeeTakenFromWinnerNotFromRefund() public {
        vm.prank(owner);
        escrow.setFee(100, treasury); // 1 %
        uint256 id = _active(address(0));
        uint256 before = usd.balanceOf(alice);
        _report(bob, id, BetEscrow.Outcome.Creator);
        uint256 fee = (2 * uint256(STAKE)) / 100;
        assertEq(usd.balanceOf(treasury), fee);
        assertEq(usd.balanceOf(alice), before + 2 * STAKE - fee);

        uint256 drawId = _active(address(0));
        _report(alice, drawId, BetEscrow.Outcome.Draw);
        _report(bob, drawId, BetEscrow.Outcome.Draw);
        assertEq(usd.balanceOf(treasury), fee);
    }

    function test_FeeChangeDoesNotTouchRunningBets() public {
        uint256 id = _active(address(0)); // created at 0 %
        vm.prank(owner);
        escrow.setFee(200, treasury);
        _report(alice, id, BetEscrow.Outcome.Taker);
        assertEq(usd.balanceOf(treasury), 0);
    }

    // ---------------------------------------------------------------- invariants

    /// Whatever happens, the escrow pays out exactly what it took in.
    function testFuzz_PayoutConservesMoney(uint96 stake, uint8 a, uint8 b, uint16 fee) public {
        stake = uint96(bound(stake, 1, 100e6));
        fee = uint16(bound(fee, 0, 200));
        vm.prank(owner);
        escrow.setFee(fee, treasury);

        vm.prank(alice);
        uint256 id = escrow.create("x", address(0), carol, stake, joinBy, decideBy);
        vm.prank(bob);
        escrow.join(id);

        BetEscrow.Outcome oa = BetEscrow.Outcome(bound(a, 0, 3));
        BetEscrow.Outcome ob = BetEscrow.Outcome(bound(b, 0, 3));
        if (oa != BetEscrow.Outcome.None) _report(alice, id, oa);
        if (ob != BetEscrow.Outcome.None && escrow.getBet(id).status == BetEscrow.Status.Active) {
            _report(bob, id, ob);
        }
        BetEscrow.Status s = escrow.getBet(id).status;
        if (s == BetEscrow.Status.Active) {
            vm.warp(decideBy + 1);
            escrow.finalize(id);
        } else if (s == BetEscrow.Status.Disputed) {
            vm.warp(block.timestamp + escrow.ARBITER_WINDOW() + 1);
            escrow.finalize(id);
        }

        assertEq(uint8(escrow.getBet(id).status), uint8(BetEscrow.Status.Settled));
        assertEq(usd.balanceOf(address(escrow)), 0);
        assertEq(
            usd.balanceOf(alice) + usd.balanceOf(bob) + usd.balanceOf(treasury), 2 * usd.FAUCET_AMOUNT()
        );
    }
}

contract TestDollarTest is Test {
    TestDollar usd = new TestDollar();
    address alice = makeAddr("alice");

    function test_FaucetCooldown() public {
        vm.warp(1_800_000_000);
        vm.startPrank(alice);
        usd.faucet();
        assertEq(usd.balanceOf(alice), 100e6);
        vm.expectRevert(abi.encodeWithSelector(TestDollar.FaucetCooldown.selector, block.timestamp + 1 days));
        usd.faucet();
        vm.warp(block.timestamp + 1 days);
        usd.faucet();
        assertEq(usd.balanceOf(alice), 200e6);
        assertEq(usd.decimals(), 6);
    }
}
