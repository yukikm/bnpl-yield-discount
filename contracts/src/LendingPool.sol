// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ITIP20} from "./ITIP20.sol";

interface ILoanManagerReceivables {
    function totalReceivables() external view returns (uint256);
}

/// @notice Share-based lending pool (MVP). Holds AlphaUSD cash and accounts for onchain receivables.
contract LendingPool {
    error NotOwner();
    error NotLoanManager();
    error ZeroAmount();
    error InsufficientCash();
    error InsufficientLiquidity();

    event Deposit(address indexed lender, uint256 assets, uint256 shares);
    event Withdraw(address indexed lender, uint256 assets, uint256 shares);
    event MerchantPaid(address indexed merchant, uint256 amount);
    event LoanManagerSet(address indexed loanManager);

    ITIP20 public immutable asset;

    address public owner;
    address public loanManager;

    uint256 public totalShares;
    mapping(address => uint256) public shareOf;

    constructor(address asset_) {
        asset = ITIP20(asset_);
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyLoanManager() {
        if (msg.sender != loanManager) revert NotLoanManager();
        _;
    }

    function setLoanManager(address loanManager_) external onlyOwner {
        loanManager = loanManager_;
        emit LoanManagerSet(loanManager_);
    }

    function cash() public view returns (uint256) {
        return asset.balanceOf(address(this));
    }

    function totalAssets() public view returns (uint256) {
        uint256 receivables = 0;
        if (loanManager != address(0)) {
            receivables = ILoanManagerReceivables(loanManager).totalReceivables();
        }
        return cash() + receivables;
    }

    function deposit(uint256 assets) external returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();

        uint256 _totalShares = totalShares;
        if (_totalShares == 0) {
            shares = assets;
        } else {
            shares = (assets * _totalShares) / totalAssets();
        }
        if (shares == 0) revert ZeroAmount();

        totalShares = _totalShares + shares;
        shareOf[msg.sender] += shares;

        bool ok = asset.transferFrom(msg.sender, address(this), assets);
        require(ok, "TRANSFER_FROM_FAILED");

        emit Deposit(msg.sender, assets, shares);
    }

    function withdraw(uint256 shares) external returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        uint256 userShares = shareOf[msg.sender];
        require(userShares >= shares, "INSUFFICIENT_SHARES");

        assets = (shares * totalAssets()) / totalShares;
        if (cash() < assets) revert InsufficientLiquidity();

        shareOf[msg.sender] = userShares - shares;
        totalShares -= shares;

        bool ok = asset.transfer(msg.sender, assets);
        require(ok, "TRANSFER_FAILED");

        emit Withdraw(msg.sender, assets, shares);
    }

    /// @notice Pays the merchant at loan open. Called only by LoanManager.
    function payMerchant(address merchant, uint256 amount) external onlyLoanManager {
        if (amount == 0) revert ZeroAmount();
        if (cash() < amount) revert InsufficientCash();

        bool ok = asset.transfer(merchant, amount);
        require(ok, "TRANSFER_FAILED");

        emit MerchantPaid(merchant, amount);
    }
}

