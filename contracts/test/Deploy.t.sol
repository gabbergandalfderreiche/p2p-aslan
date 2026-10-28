// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {BetEscrow} from "../src/BetEscrow.sol";
import {TestDollar} from "../src/TestDollar.sol";

contract DeployTest is Test {
    address admin = makeAddr("admin");

    function test_DeploySetsUpRoles() public {
        vm.chainId(84532);
        Deploy script = new Deploy();
        Deploy.Deployment memory d = script.deploy(admin, 2 days, address(0), makeAddr("curator"), address(this));
        assertEq(d.escrow.owner(), address(d.timelock));
        assertEq(address(d.escrow.token()), address(d.token));
        assertEq(d.timelock.getMinDelay(), 2 days);
        assertEq(TestDollar(address(d.token)).decimals(), 6);
        assertEq(d.matchBets.owner(), address(d.timelock));
        assertEq(d.matchBets.curator(), makeAddr("curator"));
        assertEq(d.oracle, 0x0F7fC5E6482f096380db6158f978167b57388deE);
        assertEq(d.matchBets.liveness(), 2 hours);
    }

    function test_RunRefusesMainnet() public {
        vm.chainId(8453);
        vm.setEnv("ADMIN", vm.toString(admin));
        vm.setEnv("CURATOR", vm.toString(admin));
        Deploy script = new Deploy();
        vm.expectRevert(abi.encodeWithSelector(Deploy.UnsupportedChain.selector, 8453));
        script.run();
    }
}
