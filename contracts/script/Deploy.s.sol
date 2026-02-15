// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {LendingPool} from "../src/LendingPool.sol";
import {LoanManager} from "../src/LoanManager.sol";
import {CollateralVault} from "../src/CollateralVault.sol";
import {DiscountVault} from "../src/DiscountVault.sol";

contract Deploy is Script {
    function run() external {
        address asset = vm.envAddress("ALPHA_USD_ADDRESS");

        // Optional overrides for roles. If omitted, uses the deployer EOA.
        address operator_ = vm.envOr("OPERATOR_ADDRESS", msg.sender);
        address strategyWallet_ = vm.envOr("STRATEGY_WALLET_ADDRESS", operator_);
        address invoiceSigner_ = vm.envOr("INVOICE_SIGNER_ADDRESS", operator_);

        vm.startBroadcast();

        LendingPool pool = new LendingPool(asset);
        CollateralVault collateralVault = new CollateralVault(asset);
        DiscountVault discountVault = new DiscountVault(asset);
        LoanManager loanManager = new LoanManager(asset, address(pool), address(collateralVault), address(discountVault));

        pool.setLoanManager(address(loanManager));
        collateralVault.setLoanManager(address(loanManager));
        discountVault.setLoanManager(address(loanManager));

        loanManager.setOperator(operator_);
        loanManager.setStrategyWallet(strategyWallet_);
        loanManager.setInvoiceSigner(invoiceSigner_);

        vm.stopBroadcast();

        console2.log("Deployed:");
        console2.log("LENDING_POOL_ADDRESS", address(pool));
        console2.log("COLLATERAL_VAULT_ADDRESS", address(collateralVault));
        console2.log("DISCOUNT_VAULT_ADDRESS", address(discountVault));
        console2.log("LOAN_MANAGER_ADDRESS", address(loanManager));
    }
}

