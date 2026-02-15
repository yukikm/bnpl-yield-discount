// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ITIP20} from "./ITIP20.sol";

/// @notice Holds harvested strategy profit (AlphaUSD) used to subsidize repayments ("discount").
contract DiscountVault {
    error NotLoanManager();
    error ZeroAmount();

    event PaidToPool(address indexed pool, uint256 amount);
    event RefundedToBorrower(address indexed borrower, uint256 amount);

    ITIP20 public immutable asset;
    address public loanManager;

    constructor(address asset_) {
        asset = ITIP20(asset_);
        loanManager = msg.sender;
    }

    modifier onlyLoanManager() {
        if (msg.sender != loanManager) revert NotLoanManager();
        _;
    }

    function setLoanManager(address loanManager_) external onlyLoanManager {
        loanManager = loanManager_;
    }

    function payToPool(address pool, uint256 amount) external onlyLoanManager {
        if (amount == 0) revert ZeroAmount();
        bool ok = asset.transfer(pool, amount);
        require(ok, "TRANSFER_FAILED");
        emit PaidToPool(pool, amount);
    }

    function refundToBorrower(address borrower, uint256 amount) external onlyLoanManager {
        if (amount == 0) revert ZeroAmount();
        bool ok = asset.transfer(borrower, amount);
        require(ok, "TRANSFER_FAILED");
        emit RefundedToBorrower(borrower, amount);
    }
}

