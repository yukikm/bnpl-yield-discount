// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ITIP20} from "./ITIP20.sol";

/// @notice Holds borrower collateral per-loan. LoanManager is the only controller.
contract CollateralVault {
    error NotLoanManager();
    error UnknownLoan();
    error StrategyOutstanding();
    error InsufficientInvestable();
    error ZeroAmount();

    event CollateralRecorded(bytes32 indexed loanId, address indexed borrower, uint256 deposited, uint256 reserved, uint256 investable);
    event InvestableReleased(bytes32 indexed loanId, address indexed to, uint256 amount);
    event PrincipalRecovered(bytes32 indexed loanId, uint256 amount);
    event Seized(bytes32 indexed loanId, address indexed to, uint256 amount);
    event CollateralReturned(bytes32 indexed loanId, address indexed borrower, uint256 amount);

    struct Position {
        address borrower;
        uint256 depositedRemaining;
        uint256 reserved;
        uint256 investable;
        uint256 delegatedOutstanding;
        bool exists;
    }

    ITIP20 public immutable asset;
    address public loanManager;

    mapping(bytes32 => Position) public positionOf;

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

    function collateralOf(bytes32 loanId) external view returns (uint256) {
        Position memory p = positionOf[loanId];
        if (!p.exists) return 0;
        return p.depositedRemaining;
    }

    function reservedCollateralOf(bytes32 loanId) external view returns (uint256) {
        return positionOf[loanId].reserved;
    }

    function investableCollateralOf(bytes32 loanId) external view returns (uint256) {
        return positionOf[loanId].investable;
    }

    function delegatedOutstandingOf(bytes32 loanId) external view returns (uint256) {
        return positionOf[loanId].delegatedOutstanding;
    }

    function investableAvailable(bytes32 loanId) public view returns (uint256) {
        Position memory p = positionOf[loanId];
        if (!p.exists) return 0;
        if (p.investable <= p.delegatedOutstanding) return 0;
        return p.investable - p.delegatedOutstanding;
    }

    function recordCollateral(
        bytes32 loanId,
        address borrower,
        uint256 depositedAmount,
        uint256 reserved,
        uint256 investable
    ) external onlyLoanManager {
        require(!positionOf[loanId].exists, "ALREADY_EXISTS");
        positionOf[loanId] = Position({
            borrower: borrower,
            depositedRemaining: depositedAmount,
            reserved: reserved,
            investable: investable,
            delegatedOutstanding: 0,
            exists: true
        });
        emit CollateralRecorded(loanId, borrower, depositedAmount, reserved, investable);
    }

    /// @notice Transfers investable collateral to strategy wallet (MVP).
    function releaseInvestableToStrategy(bytes32 loanId, address to, uint256 amount) external onlyLoanManager {
        if (amount == 0) revert ZeroAmount();
        Position storage p = positionOf[loanId];
        if (!p.exists) revert UnknownLoan();
        if (amount > investableAvailable(loanId)) revert InsufficientInvestable();

        p.delegatedOutstanding += amount;
        bool ok = asset.transfer(to, amount);
        require(ok, "TRANSFER_FAILED");

        emit InvestableReleased(loanId, to, amount);
    }

    /// @notice Updates accounting after principal was returned to this vault.
    function creditPrincipalRecovered(bytes32 loanId, uint256 amount) external onlyLoanManager {
        if (amount == 0) revert ZeroAmount();
        Position storage p = positionOf[loanId];
        if (!p.exists) revert UnknownLoan();
        require(p.delegatedOutstanding >= amount, "EXCEEDS_OUTSTANDING");
        p.delegatedOutstanding -= amount;
        emit PrincipalRecovered(loanId, amount);
    }

    /// @notice Seizes collateral to pool (liquidation).
    function seizeToPool(bytes32 loanId, address pool, uint256 amount) external onlyLoanManager {
        if (amount == 0) revert ZeroAmount();
        Position storage p = positionOf[loanId];
        if (!p.exists) revert UnknownLoan();
        if (p.delegatedOutstanding != 0) revert StrategyOutstanding();
        require(p.depositedRemaining >= amount, "INSUFFICIENT_COLLATERAL");

        p.depositedRemaining -= amount;

        bool ok = asset.transfer(pool, amount);
        require(ok, "TRANSFER_FAILED");
        emit Seized(loanId, pool, amount);
    }

    /// @notice Returns remaining collateral to borrower and clears storage.
    function returnCollateral(bytes32 loanId, address borrower) external onlyLoanManager {
        Position storage p = positionOf[loanId];
        if (!p.exists) revert UnknownLoan();
        if (p.delegatedOutstanding != 0) revert StrategyOutstanding();
        uint256 amount = p.depositedRemaining;

        delete positionOf[loanId];

        if (amount > 0) {
            bool ok = asset.transfer(borrower, amount);
            require(ok, "TRANSFER_FAILED");
        }
        emit CollateralReturned(loanId, borrower, amount);
    }
}

