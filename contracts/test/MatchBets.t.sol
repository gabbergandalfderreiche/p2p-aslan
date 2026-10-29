// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MatchBets} from "../src/MatchBets.sol";
import {TestDollar} from "../src/TestDollar.sol";
import {IOptimisticOracleV3} from "../src/interfaces/IOptimisticOracleV3.sol";
import {MockOptimisticOracleV3} from "./mocks/MockOptimisticOracleV3.sol";
import {MockBondToken} from "./mocks/MockBondToken.sol";

contract MatchBetsTest is Test {
    MatchBets bets;
    TestDollar usd;
    MockOptimisticOracleV3 oo;
    MockBondToken bondToken;

    address owner = makeAddr("owner");
    address curator = makeAddr("curator");
    address bot = makeAddr("bot");
    address alice = makeAddr("alice"); // creator
    address bob = makeAddr("bob"); // taker
    address dave = makeAddr("dave"); // outsider / disputer
    address treasury = makeAddr("treasury");

    uint64 constant MATCH = 537_001;
    uint256 constant BOND = 100e18;
    uint64 constant LIVENESS = 2 hours;
    uint96 constant STAKE = 10e6;
    uint40 kickoff;

    function setUp() public {
        vm.warp(1_800_000_000);
        usd = new TestDollar();
        oo = new MockOptimisticOracleV3(0);
        bondToken = new MockBondToken();
        bets = new MatchBets(usd, IOptimisticOracleV3(address(oo)), bondToken, BOND, LIVENESS, owner, curator);
        kickoff = uint40(block.timestamp + 1 days);

        vm.prank(curator);
        bets.addMatch(MATCH, kickoff, "FC Bayern", "Borussia Dortmund", "Bundesliga");

        address[3] memory users = [alice, bob, dave];
        for (uint256 i; i < users.length; i++) {
            vm.startPrank(users[i]);
            usd.faucet();
            usd.approve(address(bets), type(uint256).max);
            vm.stopPrank();
        }
        for (uint256 i; i < 2; i++) {
            address a = i == 0 ? bot : dave;
            bondToken.allocateTo(a, 1_000e18);
            vm.prank(a);
            bondToken.approve(i == 0 ? address(bets) : address(oo), type(uint256).max);
        }
    }

    function _bet(MatchBets.Pick c, MatchBets.Pick t) internal returns (uint256 id) {
        vm.prank(alice);
        id = bets.create(MATCH, c, STAKE, 200, address(0));
        vm.prank(bob);
        bets.join(id, t);
    }

    function _confirm(MatchBets.Result r) internal returns (bytes32 id) {
        vm.warp(uint256(kickoff) + bets.RESULT_DELAY());
        vm.prank(bot);
        id = bets.assertResult(MATCH, r);
        vm.warp(block.timestamp + LIVENESS);
        bets.settleResult(MATCH);
    }

    // ---------------------------------------------------------------- matches

    function test_OnlyCuratorAddsMatches() public {
        vm.expectRevert(MatchBets.NotCurator.selector);
        bets.addMatch(1, kickoff, "A", "B", "X");

        vm.startPrank(curator);
        vm.expectRevert(MatchBets.MatchExists.selector);
        bets.addMatch(MATCH, kickoff, "A", "B", "X");
        vm.expectRevert(MatchBets.InvalidMatch.selector);
        bets.addMatch(2, uint40(block.timestamp), "A", "B", "X");
        vm.expectRevert(MatchBets.InvalidMatch.selector);
        bets.addMatch(3, kickoff, "", "B", "X");
        bets.addMatch(4, kickoff, "A", "B", "X");
        vm.stopPrank();

        assertEq(bets.matchCount(), 2);
        uint64[] memory ids = bets.matchIds(0, 10);
        assertEq(ids.length, 2);
        assertEq(ids[1], 4);
        assertEq(bets.matchIds(5, 10).length, 0);
    }

    function test_AssertAndConfirmResult() public {
        bytes32 id = _confirm(MatchBets.Result.Home);
        MatchBets.Match memory m = bets.getMatch(MATCH);
        assertEq(uint8(m.result), uint8(MatchBets.Result.Home));
        assertEq(m.assertionId, bytes32(0));
        assertEq(bets.matchOfAssertion(id), MATCH);
        assertEq(bondToken.balanceOf(bot), 1_000e18); // bond returned

        vm.expectRevert(MatchBets.ResultKnown.selector);
        vm.prank(bot);
        bets.assertResult(MATCH, MatchBets.Result.Away);
    }

    function test_AssertRules() public {
        vm.startPrank(bot);
        vm.expectRevert(MatchBets.UnknownMatch.selector);
        bets.assertResult(9, MatchBets.Result.Home);
        vm.expectRevert(MatchBets.TooEarly.selector);
        bets.assertResult(MATCH, MatchBets.Result.Home);

        vm.warp(uint256(kickoff) + bets.RESULT_DELAY());
        vm.expectRevert(MatchBets.InvalidResult.selector);
        bets.assertResult(MATCH, MatchBets.Result.None);
        bets.assertResult(MATCH, MatchBets.Result.Home);
        vm.expectRevert(MatchBets.ResultPending.selector);
        bets.assertResult(MATCH, MatchBets.Result.Draw);
        vm.stopPrank();
    }

    function test_ClaimIsReadable() public {
        vm.warp(uint256(kickoff) + bets.RESULT_DELAY());
        vm.prank(bot);
        bytes32 id = bets.assertResult(MATCH, MatchBets.Result.Away);
        string memory claim = string(oo.claims(id));
        assertEq(
            claim,
            "Football match 537001 on football-data.org: FC Bayern vs Borussia Dortmund (Bundesliga), kickoff 1800086400 (unix time). Result after regular time (90 minutes plus stoppage time, without extra time or penalties): AWAY WIN. VOID means the match was cancelled, postponed or abandoned and not completed on that day."
        );
    }

    function test_RejectedAssertionCanBeRedone() public {
        vm.warp(uint256(kickoff) + bets.RESULT_DELAY());
        vm.prank(bot);
        bytes32 wrong = bets.assertResult(MATCH, MatchBets.Result.Away);
        vm.prank(dave);
        oo.disputeAssertion(wrong, dave);
        assertEq(bets.getMatch(MATCH).assertionId, wrong); // still pending during the vote

        oo.resolveDispute(wrong, false);
        MatchBets.Match memory m = bets.getMatch(MATCH);
        assertEq(uint8(m.result), uint8(MatchBets.Result.None));
        assertEq(m.assertionId, bytes32(0));
        assertEq(bondToken.balanceOf(dave), 1_000e18 + BOND); // disputer took the bond

        vm.prank(bot);
        bets.assertResult(MATCH, MatchBets.Result.Home);
        vm.warp(block.timestamp + LIVENESS);
        bets.settleResult(MATCH);
        assertEq(uint8(bets.getMatch(MATCH).result), uint8(MatchBets.Result.Home));
    }

    function test_OnlyOracleCallsBack() public {
        vm.expectRevert(MatchBets.NotOracle.selector);
        bets.assertionResolvedCallback(bytes32(uint256(1)), true);
        vm.expectRevert(MatchBets.NotOracle.selector);
        bets.assertionDisputedCallback(bytes32(uint256(1)));
    }

    // ---------------------------------------------------------------- bets

    function test_CreateAndJoin() public {
        vm.prank(alice);
        uint256 id = bets.create(MATCH, MatchBets.Pick.Home, 10e6, 200, address(0));
        assertEq(usd.balanceOf(address(bets)), 10e6);
        assertEq(uint8(bets.getBet(id).takerPick), uint8(MatchBets.Pick.None)); // chosen by the taker
        vm.prank(bob);
        bets.join(id, MatchBets.Pick.Draw);
        MatchBets.Bet memory b = bets.getBet(id);
        assertEq(b.taker, bob);
        assertEq(uint8(b.takerPick), uint8(MatchBets.Pick.Draw));
        assertEq(b.takerStake, 10e6);
        assertEq(uint8(b.status), uint8(MatchBets.Status.Active));
        assertEq(usd.balanceOf(address(bets)), 20e6); // same stake on both sides
        assertEq(bets.betsOf(bob)[0], id);
    }

    function test_CreateRules() public {
        vm.startPrank(alice);
        vm.expectRevert(MatchBets.UnknownMatch.selector);
        bets.create(1, MatchBets.Pick.Home, STAKE, 200, address(0));
        vm.expectRevert(MatchBets.InvalidPick.selector);
        bets.create(MATCH, MatchBets.Pick.None, STAKE, 200, address(0));
        vm.expectRevert(MatchBets.InvalidStake.selector);
        bets.create(MATCH, MatchBets.Pick.Home, 0, 200, address(0));
        vm.expectRevert(MatchBets.InvalidParticipants.selector);
        bets.create(MATCH, MatchBets.Pick.Home, STAKE, 200, alice);
        vm.warp(kickoff);
        vm.expectRevert(MatchBets.TooLate.selector);
        bets.create(MATCH, MatchBets.Pick.Home, STAKE, 200, address(0));
        vm.stopPrank();
    }

    function test_JoinRules() public {
        vm.prank(alice);
        uint256 id = bets.create(MATCH, MatchBets.Pick.Home, STAKE, 200, bob);
        vm.expectRevert(MatchBets.NotAllowed.selector);
        vm.prank(dave);
        bets.join(id, MatchBets.Pick.Away);
        vm.expectRevert(MatchBets.NotAllowed.selector);
        vm.prank(alice);
        bets.join(id, MatchBets.Pick.Away);
        // The creator's outcome is taken, and a taker must pick something.
        vm.expectRevert(MatchBets.InvalidPick.selector);
        vm.prank(bob);
        bets.join(id, MatchBets.Pick.Home);
        vm.expectRevert(MatchBets.InvalidPick.selector);
        vm.prank(bob);
        bets.join(id, MatchBets.Pick.None);
        vm.warp(kickoff);
        vm.expectRevert(MatchBets.TooLate.selector);
        vm.prank(bob);
        bets.join(id, MatchBets.Pick.Away);
    }

    function test_CancelOpenBet() public {
        vm.prank(alice);
        uint256 id = bets.create(MATCH, MatchBets.Pick.Home, STAKE, 200, address(0));
        vm.expectRevert(MatchBets.NotAllowed.selector);
        vm.prank(dave);
        bets.cancel(id);
        vm.warp(kickoff);
        uint256 before = usd.balanceOf(alice);
        vm.prank(dave);
        bets.cancel(id);
        assertEq(usd.balanceOf(alice), before + STAKE);
    }

    function test_SettleCreatorWins() public {
        uint256 id = _bet(MatchBets.Pick.Home, MatchBets.Pick.Away);
        vm.expectRevert(MatchBets.TooEarly.selector);
        bets.settle(id);
        _confirm(MatchBets.Result.Home);
        uint256 before = usd.balanceOf(alice);
        vm.prank(dave);
        bets.settle(id);
        assertEq(usd.balanceOf(alice), before + 2 * STAKE);
        assertEq(uint8(bets.getBet(id).payout), uint8(MatchBets.Payout.Creator));
        vm.expectRevert(MatchBets.WrongStatus.selector);
        bets.settle(id);
    }

    function test_SettleTakerWins() public {
        uint256 id = _bet(MatchBets.Pick.Home, MatchBets.Pick.Draw);
        _confirm(MatchBets.Result.Draw);
        uint256 before = usd.balanceOf(bob);
        bets.settle(id);
        assertEq(usd.balanceOf(bob), before + 2 * STAKE);
    }

    function test_NeitherPickRefunds() public {
        uint256 id = _bet(MatchBets.Pick.Home, MatchBets.Pick.Away);
        _confirm(MatchBets.Result.Draw);
        uint256 a = usd.balanceOf(alice);
        uint256 b = usd.balanceOf(bob);
        bets.settle(id);
        assertEq(usd.balanceOf(alice), a + STAKE);
        assertEq(usd.balanceOf(bob), b + STAKE);
    }

    function test_VoidRefunds() public {
        uint256 id = _bet(MatchBets.Pick.Home, MatchBets.Pick.Draw);
        _confirm(MatchBets.Result.Void);
        assertEq(uint8(bets.payoutOf(id)), uint8(MatchBets.Payout.Refund));
    }

    function test_TimeoutRefundsAndIgnoresLateResult() public {
        uint256 id = _bet(MatchBets.Pick.Home, MatchBets.Pick.Away);
        // Asserted just before the timeout, confirmed after it.
        vm.warp(uint256(kickoff) + bets.RESULT_TIMEOUT() - 1);
        vm.prank(bot);
        bets.assertResult(MATCH, MatchBets.Result.Home);
        assertEq(uint8(bets.payoutOf(id)), uint8(MatchBets.Payout.None));
        vm.warp(block.timestamp + LIVENESS);
        bets.settleResult(MATCH);
        assertEq(uint8(bets.getMatch(MATCH).result), uint8(MatchBets.Result.None));

        uint256 a = usd.balanceOf(alice);
        bets.settle(id);
        assertEq(usd.balanceOf(alice), a + STAKE);

        vm.expectRevert(MatchBets.TooLate.selector);
        vm.prank(bot);
        bets.assertResult(MATCH, MatchBets.Result.Home);
    }

    // ---------------------------------------------------------------- quotes

    function test_QuoteSetsTakerStake() public {
        vm.startPrank(alice);
        uint256 underdog = bets.create(MATCH, MatchBets.Pick.Away, 10e6, 300, address(0)); // 3.00
        uint256 favourite = bets.create(MATCH, MatchBets.Pick.Home, 10e6, 150, address(0)); // 1.50
        vm.stopPrank();
        assertEq(bets.getBet(underdog).takerStake, 20e6);
        assertEq(bets.getBet(favourite).takerStake, 5e6);

        vm.startPrank(bob);
        bets.join(underdog, MatchBets.Pick.Home);
        bets.join(favourite, MatchBets.Pick.Away);
        vm.stopPrank();
        assertEq(usd.balanceOf(address(bets)), 20e6 + 20e6 + 5e6);

        // Away win: alice's underdog bet pays 3 × 10, bob's side of the favourite bet pays 15.
        _confirm(MatchBets.Result.Away);
        uint256 a = usd.balanceOf(alice);
        uint256 b = usd.balanceOf(bob);
        bets.settle(underdog);
        bets.settle(favourite);
        assertEq(usd.balanceOf(alice), a + 30e6);
        assertEq(usd.balanceOf(bob), b + 15e6);
    }

    function test_QuoteBounds() public {
        vm.startPrank(alice);
        vm.expectRevert(MatchBets.InvalidQuote.selector);
        bets.create(MATCH, MatchBets.Pick.Home, STAKE, 100, address(0));
        vm.expectRevert(MatchBets.InvalidQuote.selector);
        bets.create(MATCH, MatchBets.Pick.Home, STAKE, 1001, address(0));
        vm.expectRevert(MatchBets.InvalidStake.selector);
        bets.create(MATCH, MatchBets.Pick.Home, 50, 101, address(0)); // taker stake rounds to 0
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- admin

    function test_AdminOnlyOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vm.prank(alice);
        bets.setCurator(alice);

        vm.startPrank(owner);
        bets.setCurator(dave);
        vm.expectRevert(MatchBets.InvalidFee.selector);
        bets.setFee(201, treasury);
        bets.setFee(100, treasury);
        vm.stopPrank();
        assertEq(bets.curator(), dave);
    }

    function test_FeeFromWinnerOnly() public {
        vm.prank(owner);
        bets.setFee(100, treasury);
        uint256 win = _bet(MatchBets.Pick.Home, MatchBets.Pick.Away);
        uint256 refund = _bet(MatchBets.Pick.Draw, MatchBets.Pick.Away);
        _confirm(MatchBets.Result.Home);
        bets.settle(win);
        bets.settle(refund);
        assertEq(usd.balanceOf(treasury), (2 * uint256(STAKE)) / 100);
    }

    /// Every combination of picks and results pays out exactly what came in.
    function testFuzz_ConservesMoney(uint8 c, uint8 t, uint8 r, uint96 stake, uint16 quote, uint16 fee) public {
        MatchBets.Pick cp = MatchBets.Pick(bound(c, 1, 3));
        MatchBets.Pick tp = MatchBets.Pick(bound(t, 1, 3));
        vm.assume(tp != cp);
        stake = uint96(bound(stake, 1e6, 10e6));
        quote = uint16(bound(quote, 101, 1000));
        vm.prank(owner);
        bets.setFee(uint16(bound(fee, 0, 200)), treasury);

        vm.prank(alice);
        uint256 id = bets.create(MATCH, cp, stake, quote, address(0));
        vm.prank(bob);
        bets.join(id, tp);
        _confirm(MatchBets.Result(bound(r, 1, 4)));
        bets.settle(id);

        assertEq(usd.balanceOf(address(bets)), 0);
        assertEq(usd.balanceOf(alice) + usd.balanceOf(bob) + usd.balanceOf(treasury), 2 * usd.FAUCET_AMOUNT());
    }
}
