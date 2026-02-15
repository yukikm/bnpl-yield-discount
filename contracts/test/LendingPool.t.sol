// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

import {LendingPool} from "../src/LendingPool.sol";
import {MockTIP20} from "./mocks/MockTIP20.sol";

contract MockReceivables {
    uint256 public totalReceivables;

    function setTotalReceivables(uint256 v) external {
        totalReceivables = v;
    }
}

contract LendingPoolTest is Test {
    MockTIP20 internal token;
    LendingPool internal pool;
    MockReceivables internal receivables;

    address internal lender = address(0xA11CE);

    function setUp() external {
        token = new MockTIP20();
        pool = new LendingPool(address(token));

        receivables = new MockReceivables();
        pool.setLoanManager(address(receivables));

        token.mint(lender, 20_000 * 1e6);
        vm.prank(lender);
        token.approve(address(pool), type(uint256).max);
    }

    function test_deposit_withdraw_basic() external {
        vm.startPrank(lender);
        pool.deposit(10_000 * 1e6);

        assertEq(pool.totalShares(), 10_000 * 1e6);
        assertEq(pool.shareOf(lender), 10_000 * 1e6);
        assertEq(pool.cash(), 10_000 * 1e6);

        uint256 assets = pool.withdraw(1_000 * 1e6);
        assertEq(assets, 1_000 * 1e6);
        assertEq(pool.cash(), 9_000 * 1e6);
        vm.stopPrank();
    }

    function test_withdraw_reverts_when_cash_insufficient() external {
        vm.startPrank(lender);
        pool.deposit(1_000 * 1e6);

        // Simulate outstanding receivables (totalAssets > cash)
        receivables.setTotalReceivables(1_000 * 1e6);

        vm.expectRevert(LendingPool.InsufficientLiquidity.selector);
        pool.withdraw(1_000 * 1e6);

        vm.stopPrank();
    }
}

