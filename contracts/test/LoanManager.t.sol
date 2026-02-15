// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

import {LoanManager} from "../src/LoanManager.sol";
import {LendingPool} from "../src/LendingPool.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {DiscountVault} from "../src/DiscountVault.sol";
import {MockTIP20} from "./mocks/MockTIP20.sol";

contract LoanManagerTest is Test {
    MockTIP20 internal token;
    LendingPool internal pool;
    CollateralVault internal collateralVault;
    DiscountVault internal discountVault;
    LoanManager internal loanManager;

    address internal lender = address(0xA11CE);
    address internal borrower = address(0xB0B0);
    address internal merchant = address(0xCAFE);
    address internal operator = address(0xBEEF);
    address internal strategyWallet = address(0xD00D);

    uint256 internal invoiceSignerPk = 0xA11CE123;
    address internal invoiceSigner;

    function setUp() external {
        vm.chainId(42431);

        invoiceSigner = vm.addr(invoiceSignerPk);

        token = new MockTIP20();
        pool = new LendingPool(address(token));
        collateralVault = new CollateralVault(address(token));
        discountVault = new DiscountVault(address(token));
        loanManager = new LoanManager(address(token), address(pool), address(collateralVault), address(discountVault));

        // Wire dependencies
        pool.setLoanManager(address(loanManager));
        collateralVault.setLoanManager(address(loanManager));
        discountVault.setLoanManager(address(loanManager));

        // Configure roles
        loanManager.setOperator(operator);
        loanManager.setStrategyWallet(strategyWallet);
        loanManager.setInvoiceSigner(invoiceSigner);

        // Fund + approve
        token.mint(lender, 20_000 * 1e6);
        vm.prank(lender);
        token.approve(address(pool), type(uint256).max);

        vm.prank(lender);
        pool.deposit(10_000 * 1e6);

        token.mint(borrower, 10_000 * 1e6);
        vm.prank(borrower);
        token.approve(address(loanManager), type(uint256).max);

        token.mint(strategyWallet, 10_000 * 1e6);
        vm.prank(strategyWallet);
        token.approve(address(loanManager), type(uint256).max);
    }

    function _signInvoice(LoanManager.InvoiceData memory invoice) internal view returns (bytes memory) {
        bytes32 domainSeparator = loanManager.domainSeparator();
        bytes32 invoiceTypehash =
            keccak256("InvoiceData(bytes32 correlationId,address merchant,uint256 price,uint64 dueTimestamp)");
        bytes32 structHash =
            keccak256(abi.encode(invoiceTypehash, invoice.correlationId, invoice.merchant, invoice.price, invoice.dueTimestamp));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(invoiceSignerPk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_openLoan_success() external {
        bytes32 loanId = keccak256("corr-1");
        LoanManager.InvoiceData memory invoice = LoanManager.InvoiceData({
            correlationId: loanId,
            merchant: merchant,
            price: 1_000 * 1e6,
            dueTimestamp: uint64(block.timestamp + 14 days)
        });
        bytes memory sig = _signInvoice(invoice);

        uint256 borrowerBalBefore = token.balanceOf(borrower);
        uint256 merchantBalBefore = token.balanceOf(merchant);
        uint256 poolCashBefore = pool.cash();

        vm.prank(borrower);
        loanManager.openLoan(invoice, sig, 1_600 * 1e6);

        assertEq(token.balanceOf(merchant) - merchantBalBefore, 970 * 1e6);
        assertEq(poolCashBefore - pool.cash(), 970 * 1e6);

        // Borrower only paid collateral deposit (no direct merchant payment)
        assertEq(borrowerBalBefore - token.balanceOf(borrower), 1_600 * 1e6);

        LoanManager.Loan memory loan = loanManager.getLoan(loanId);
        assertEq(uint256(loan.state), uint256(LoanManager.LoanState.Open));
        assertEq(loan.amountDueOutstanding, 1_000 * 1e6);

        assertEq(loan.reservedCollateral, 1_250 * 1e6);
        assertEq(loan.investableCollateral, 350 * 1e6);

        assertEq(collateralVault.reservedCollateralOf(loanId), 1_250 * 1e6);
        assertEq(collateralVault.investableCollateralOf(loanId), 350 * 1e6);
    }

    function test_openLoan_reverts_on_invalid_signature() external {
        bytes32 loanId = keccak256("corr-2");
        LoanManager.InvoiceData memory invoice = LoanManager.InvoiceData({
            correlationId: loanId,
            merchant: merchant,
            price: 1_000 * 1e6,
            dueTimestamp: uint64(block.timestamp + 14 days)
        });
        bytes memory sig = _signInvoice(invoice);

        // Tamper with invoice data after signing
        invoice.price = 1_001 * 1e6;

        vm.prank(borrower);
        vm.expectRevert(LoanManager.InvalidSignature.selector);
        loanManager.openLoan(invoice, sig, 1_600 * 1e6);
    }

    function test_openLoan_reverts_on_insufficient_collateral() external {
        bytes32 loanId = keccak256("corr-3");
        LoanManager.InvoiceData memory invoice = LoanManager.InvoiceData({
            correlationId: loanId,
            merchant: merchant,
            price: 1_000 * 1e6,
            dueTimestamp: uint64(block.timestamp + 14 days)
        });
        bytes memory sig = _signInvoice(invoice);

        vm.prank(borrower);
        vm.expectRevert(LoanManager.InsufficientCollateral.selector);
        loanManager.openLoan(invoice, sig, 1_200 * 1e6);
    }

    function test_delegate_harvest_returnPrincipal_repay_with_discount() external {
        bytes32 loanId = keccak256("corr-4");
        LoanManager.InvoiceData memory invoice = LoanManager.InvoiceData({
            correlationId: loanId,
            merchant: merchant,
            price: 1_000 * 1e6,
            dueTimestamp: uint64(block.timestamp + 14 days)
        });
        bytes memory sig = _signInvoice(invoice);

        vm.prank(borrower);
        loanManager.openLoan(invoice, sig, 1_600 * 1e6);

        uint256 strategyBalBefore = token.balanceOf(strategyWallet);
        vm.prank(operator);
        loanManager.delegateInvestableToStrategy(loanId);

        // investable = 350
        assertEq(token.balanceOf(strategyWallet) - strategyBalBefore, 350 * 1e6);

        // Harvest realized profit (minted for test)
        token.mint(strategyWallet, 20 * 1e6);
        vm.prank(operator);
        loanManager.harvestProfit(20 * 1e6);

        // Return principal (burn shares) but keep profit credit available
        vm.prank(operator);
        loanManager.returnStrategyPrincipal(loanId, 350 * 1e6);

        assertApproxEqAbs(loanManager.pendingProfit(loanId), 20 * 1e6, 1);

        uint256 poolCashBefore = pool.cash();

        vm.prank(borrower);
        loanManager.repay(loanId, 1_000 * 1e6);

        LoanManager.Loan memory loan = loanManager.getLoan(loanId);
        assertEq(uint256(loan.state), uint256(LoanManager.LoanState.Closed));
        assertEq(uint256(loan.settlementType), uint256(LoanManager.SettlementType.Repaid));
        assertEq(loan.amountDueOutstanding, 0);

        // Pool receives full repayTargetAmount (980 from borrower + 20 from DiscountVault)
        assertEq(pool.cash() - poolCashBefore, 1_000 * 1e6);
        // Rounding dust may remain in the vault due to `accProfitPerShare` integer division.
        assertLe(token.balanceOf(address(discountVault)), 1);
    }

    function test_liquidate_charges_fees_and_returns_excess() external {
        bytes32 loanId = keccak256("corr-5");
        uint64 due = uint64(block.timestamp + 1 days);
        LoanManager.InvoiceData memory invoice = LoanManager.InvoiceData({
            correlationId: loanId,
            merchant: merchant,
            price: 1_000 * 1e6,
            dueTimestamp: due
        });
        bytes memory sig = _signInvoice(invoice);

        vm.prank(borrower);
        loanManager.openLoan(invoice, sig, 1_600 * 1e6);

        // Warp to lateStart + 1 second => daysLate = 1
        vm.warp(uint256(due) + loanManager.GRACE_PERIOD() + 1);

        uint256 poolCashBefore = pool.cash();
        uint256 borrowerBalBefore = token.balanceOf(borrower);

        vm.prank(operator);
        loanManager.liquidate(loanId);

        // fees = LATE_FEE(5) + penalty(0.1% of 1000 = 1) = 6
        assertEq(pool.cash() - poolCashBefore, 1_006 * 1e6);

        // borrower gets back remaining collateral: 1600 - 1006 = 594
        assertEq(token.balanceOf(borrower) - borrowerBalBefore, 594 * 1e6);

        LoanManager.Loan memory loan = loanManager.getLoan(loanId);
        assertEq(uint256(loan.state), uint256(LoanManager.LoanState.Closed));
        assertEq(uint256(loan.settlementType), uint256(LoanManager.SettlementType.Liquidated));
        assertEq(loan.amountDueOutstanding, 0);
    }
}
