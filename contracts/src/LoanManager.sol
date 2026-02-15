// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ITIP20} from "./ITIP20.sol";
import {LendingPool} from "./LendingPool.sol";
import {CollateralVault} from "./CollateralVault.sol";
import {DiscountVault} from "./DiscountVault.sol";

/// @notice BNPL loan ledger + strategy pool profit accounting (MVP).
contract LoanManager {
    // -----------------------------
    // Errors
    // -----------------------------
    error NotOwner();
    error NotOperator();
    error LoanAlreadyExists();
    error LoanNotOpen();
    error InvalidSignature();
    error DueTimestampNotFuture();
    error InsufficientCollateral();
    error ZeroAmount();
    error RepayTooLate();
    error RepayExceedsOutstanding();
    error InvestableBelowMinOrder();
    error StrategyPrincipalOutstanding();
    error LiquidationNotAllowed();

    // -----------------------------
    // Events
    // -----------------------------
    event OperatorSet(address indexed operator);
    event StrategyWalletSet(address indexed strategyWallet);
    event InvoiceSignerSet(address indexed invoiceSigner);

    event LoanOpened(
        bytes32 indexed loanId,
        address indexed borrower,
        address indexed merchant,
        uint256 principal,
        uint256 merchantFee,
        uint256 merchantPayout,
        uint64 dueTimestamp,
        uint256 collateralDeposit,
        uint256 reservedCollateral,
        uint256 investableCollateral
    );

    event Repaid(
        bytes32 indexed loanId,
        address indexed borrower,
        uint256 repayTargetAmount,
        uint256 discountApplied,
        uint256 borrowerPayAmount,
        uint256 amountDueOutstandingAfter,
        bool closed
    );

    event Delegated(bytes32 indexed loanId, uint256 amount, address indexed strategyWallet);
    event Harvested(uint256 profitAmount, uint256 accProfitPerShare);
    event PrincipalReturned(bytes32 indexed loanId, uint256 amount);
    event Liquidated(bytes32 indexed loanId, uint256 principalRecovered, uint256 feesCharged, uint256 totalRecovered);

    // -----------------------------
    // Types
    // -----------------------------
    struct InvoiceData {
        bytes32 correlationId;
        address merchant;
        uint256 price; // AlphaUSD, decimals=6
        uint64 dueTimestamp;
    }

    enum LoanState {
        None,
        Open,
        Closed
    }

    enum SettlementType {
        None,
        Repaid,
        Liquidated
    }

    struct Loan {
        address borrower;
        address merchant;
        uint256 principal;
        uint256 amountDueOutstanding;
        uint64 dueTimestamp;
        LoanState state;
        SettlementType settlementType;

        uint256 collateralDeposit;
        uint256 reservedCollateral;
        uint256 investableCollateral;

        uint256 strategyPrincipalOutstanding;
        uint256 strategyShares; // MVP: 1 share = 1 AlphaUSD base unit delegated
        uint256 rewardDebt; // shares * accProfitPerShare / ACC_PRECISION, updated on share changes and accrual
        uint256 profitCredit; // accrued profit retained even after shares decrease (MVP correctness)

        uint256 merchantFee;
        uint256 merchantPayout;
    }

    // -----------------------------
    // Constants (MVP)
    // -----------------------------
    uint256 public constant BPS_DENOM = 10_000;
    uint256 public constant MERCHANT_FEE_BPS = 300; // 3.0%
    uint256 public constant COLLATERAL_RATIO_BPS = 12_500; // 125%
    uint256 public constant MAX_INVEST_BPS = 5_000; // 50%
    uint256 public constant MIN_DEX_ORDER = 100 * 10 ** 6; // $100, decimals=6
    uint256 public constant ACC_PRECISION = 1e18;
    uint256 public constant GRACE_PERIOD = 3 days;
    uint256 public constant LATE_FEE = 5 * 10 ** 6; // $5
    uint256 public constant PENALTY_BPS_PER_DAY = 10; // 0.10%/day
    uint256 public constant PENALTY_CAP_BPS = 1_000; // 10% (incl late fee)

    // -----------------------------
    // EIP-712
    // -----------------------------
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant INVOICE_TYPEHASH =
        keccak256("InvoiceData(bytes32 correlationId,address merchant,uint256 price,uint64 dueTimestamp)");

    bytes32 internal immutable NAME_HASH;
    bytes32 internal immutable VERSION_HASH;

    // -----------------------------
    // State
    // -----------------------------
    ITIP20 public immutable asset;
    LendingPool public immutable pool;
    CollateralVault public immutable collateralVault;
    DiscountVault public immutable discountVault;

    address public owner;
    address public operator;
    address public strategyWallet;
    address public invoiceSigner;

    uint256 public totalReceivables;

    uint256 public strategyTotalShares;
    uint256 public accProfitPerShare;

    mapping(bytes32 => Loan) internal loans;

    constructor(address asset_, address pool_, address collateralVault_, address discountVault_) {
        asset = ITIP20(asset_);
        pool = LendingPool(pool_);
        collateralVault = CollateralVault(collateralVault_);
        discountVault = DiscountVault(discountVault_);

        owner = msg.sender;
        operator = msg.sender;
        strategyWallet = msg.sender;
        invoiceSigner = msg.sender;

        NAME_HASH = keccak256(bytes("YieldDiscountBNPL"));
        VERSION_HASH = keccak256(bytes("1"));
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    // -----------------------------
    // Admin / Roles
    // -----------------------------
    function setOperator(address operator_) external onlyOwner {
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function setStrategyWallet(address strategyWallet_) external onlyOwner {
        strategyWallet = strategyWallet_;
        emit StrategyWalletSet(strategyWallet_);
    }

    function setInvoiceSigner(address invoiceSigner_) external onlyOwner {
        invoiceSigner = invoiceSigner_;
        emit InvoiceSignerSet(invoiceSigner_);
    }

    // -----------------------------
    // Views
    // -----------------------------
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function getLoan(bytes32 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    function amountDueOutstanding(bytes32 loanId) external view returns (uint256) {
        return loans[loanId].amountDueOutstanding;
    }

    function pendingProfit(bytes32 loanId) public view returns (uint256) {
        Loan memory loan = loans[loanId];
        if (loan.state != LoanState.Open) return 0;

        uint256 accrued = loan.profitCredit;
        uint256 pending = _pendingFromShares(loan.strategyShares, loan.rewardDebt);
        return accrued + pending;
    }

    // -----------------------------
    // Core (MVP)
    // -----------------------------
    function openLoan(InvoiceData calldata invoice, bytes calldata signature, uint256 collateralDeposit) external {
        if (invoice.dueTimestamp <= block.timestamp) revert DueTimestampNotFuture();

        bytes32 loanId = invoice.correlationId;
        if (loans[loanId].state != LoanState.None) revert LoanAlreadyExists();
        if (!_verifyInvoice(invoice, signature)) revert InvalidSignature();

        uint256 reserved = (invoice.price * COLLATERAL_RATIO_BPS) / BPS_DENOM;
        if (collateralDeposit < reserved) revert InsufficientCollateral();

        uint256 available = collateralDeposit > reserved ? collateralDeposit - reserved : 0;
        uint256 limit = (collateralDeposit * MAX_INVEST_BPS) / BPS_DENOM;
        uint256 investable = available < limit ? available : limit;

        uint256 merchantFee = (invoice.price * MERCHANT_FEE_BPS) / BPS_DENOM;
        uint256 merchantPayout = invoice.price - merchantFee;

        // Pool -> Merchant (no Borrower -> Merchant direct transfer happens here)
        pool.payMerchant(invoice.merchant, merchantPayout);

        // Borrower -> CollateralVault (transferFrom)
        bool ok = asset.transferFrom(msg.sender, address(collateralVault), collateralDeposit);
        require(ok, "TRANSFER_FROM_FAILED");

        collateralVault.recordCollateral(loanId, msg.sender, collateralDeposit, reserved, investable);

        loans[loanId] = Loan({
            borrower: msg.sender,
            merchant: invoice.merchant,
            principal: invoice.price,
            amountDueOutstanding: invoice.price,
            dueTimestamp: invoice.dueTimestamp,
            state: LoanState.Open,
            settlementType: SettlementType.None,
            collateralDeposit: collateralDeposit,
            reservedCollateral: reserved,
            investableCollateral: investable,
            strategyPrincipalOutstanding: 0,
            strategyShares: 0,
            rewardDebt: 0,
            profitCredit: 0,
            merchantFee: merchantFee,
            merchantPayout: merchantPayout
        });

        totalReceivables += invoice.price;

        emit LoanOpened(
            loanId,
            msg.sender,
            invoice.merchant,
            invoice.price,
            merchantFee,
            merchantPayout,
            invoice.dueTimestamp,
            collateralDeposit,
            reserved,
            investable
        );
    }

    function repay(bytes32 loanId, uint256 repayTargetAmount) external {
        if (repayTargetAmount == 0) revert ZeroAmount();

        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Open) revert LoanNotOpen();
        if (repayTargetAmount > loan.amountDueOutstanding) revert RepayExceedsOutstanding();
        if (block.timestamp > uint256(loan.dueTimestamp) + GRACE_PERIOD) revert RepayTooLate();

        _accrueProfit(loanId);

        uint256 discountCredits = loan.profitCredit;
        uint256 discountApplied = discountCredits < repayTargetAmount ? discountCredits : repayTargetAmount;
        uint256 borrowerPayAmount = repayTargetAmount - discountApplied;

        if (discountApplied > 0) {
            loan.profitCredit = discountCredits - discountApplied;
            discountVault.payToPool(address(pool), discountApplied);
        }

        if (borrowerPayAmount > 0) {
            bool ok = asset.transferFrom(msg.sender, address(pool), borrowerPayAmount);
            require(ok, "TRANSFER_FROM_FAILED");
        }

        loan.amountDueOutstanding -= repayTargetAmount;
        totalReceivables -= repayTargetAmount;

        bool closed = false;
        if (loan.amountDueOutstanding == 0) {
            if (loan.strategyPrincipalOutstanding != 0) revert StrategyPrincipalOutstanding();

            loan.state = LoanState.Closed;
            loan.settlementType = SettlementType.Repaid;
            closed = true;

            collateralVault.returnCollateral(loanId, loan.borrower);

            if (loan.profitCredit > 0) {
                uint256 refund = loan.profitCredit;
                loan.profitCredit = 0;
                discountVault.refundToBorrower(loan.borrower, refund);
            }
        }

        emit Repaid(
            loanId,
            loan.borrower,
            repayTargetAmount,
            discountApplied,
            borrowerPayAmount,
            loan.amountDueOutstanding,
            closed
        );
    }

    function delegateInvestableToStrategy(bytes32 loanId) external onlyOperator {
        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Open) revert LoanNotOpen();

        uint256 amount = collateralVault.investableAvailable(loanId);
        if (amount < MIN_DEX_ORDER) revert InvestableBelowMinOrder();

        _accrueProfit(loanId);

        collateralVault.releaseInvestableToStrategy(loanId, strategyWallet, amount);

        loan.strategyPrincipalOutstanding += amount;

        loan.strategyShares += amount;
        strategyTotalShares += amount;
        loan.rewardDebt = (loan.strategyShares * accProfitPerShare) / ACC_PRECISION;

        emit Delegated(loanId, amount, strategyWallet);
    }

    function harvestProfit(uint256 profitAmount) external onlyOperator {
        if (profitAmount == 0) revert ZeroAmount();
        require(strategyTotalShares > 0, "NO_STRATEGY_SHARES");

        bool ok = asset.transferFrom(strategyWallet, address(discountVault), profitAmount);
        require(ok, "TRANSFER_FROM_FAILED");

        accProfitPerShare += (profitAmount * ACC_PRECISION) / strategyTotalShares;

        emit Harvested(profitAmount, accProfitPerShare);
    }

    function returnStrategyPrincipal(bytes32 loanId, uint256 amount) external onlyOperator {
        if (amount == 0) revert ZeroAmount();

        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Open) revert LoanNotOpen();
        require(loan.strategyPrincipalOutstanding >= amount, "EXCEEDS_OUTSTANDING");

        _accrueProfit(loanId);

        bool ok = asset.transferFrom(strategyWallet, address(collateralVault), amount);
        require(ok, "TRANSFER_FROM_FAILED");

        collateralVault.creditPrincipalRecovered(loanId, amount);

        loan.strategyPrincipalOutstanding -= amount;

        loan.strategyShares -= amount;
        strategyTotalShares -= amount;
        loan.rewardDebt = (loan.strategyShares * accProfitPerShare) / ACC_PRECISION;

        emit PrincipalReturned(loanId, amount);
    }

    function liquidate(bytes32 loanId) external onlyOperator {
        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Open) revert LoanNotOpen();

        if (block.timestamp <= uint256(loan.dueTimestamp) + GRACE_PERIOD) revert LiquidationNotAllowed();
        if (loan.strategyPrincipalOutstanding != 0) revert StrategyPrincipalOutstanding();

        _accrueProfit(loanId);

        uint256 principalOutstanding = loan.amountDueOutstanding;
        uint256 feesToCharge = _calculateFees(principalOutstanding, loan.principal, loan.dueTimestamp);
        uint256 totalToRecover = principalOutstanding + feesToCharge;

        collateralVault.seizeToPool(loanId, address(pool), totalToRecover);

        loan.amountDueOutstanding = 0;
        loan.state = LoanState.Closed;
        loan.settlementType = SettlementType.Liquidated;
        totalReceivables -= principalOutstanding;

        collateralVault.returnCollateral(loanId, loan.borrower);

        if (loan.profitCredit > 0) {
            uint256 refund = loan.profitCredit;
            loan.profitCredit = 0;
            discountVault.refundToBorrower(loan.borrower, refund);
        }

        emit Liquidated(loanId, principalOutstanding, feesToCharge, totalToRecover);
    }

    // -----------------------------
    // Internal
    // -----------------------------
    function _pendingFromShares(uint256 shares, uint256 debt) internal view returns (uint256) {
        if (shares == 0) return 0;
        uint256 accrued = (shares * accProfitPerShare) / ACC_PRECISION;
        if (accrued <= debt) return 0;
        return accrued - debt;
    }

    function _accrueProfit(bytes32 loanId) internal {
        Loan storage loan = loans[loanId];
        if (loan.state != LoanState.Open) return;

        uint256 pending = _pendingFromShares(loan.strategyShares, loan.rewardDebt);
        if (pending > 0) {
            loan.profitCredit += pending;
        }
        loan.rewardDebt = (loan.strategyShares * accProfitPerShare) / ACC_PRECISION;
    }

    function _verifyInvoice(InvoiceData calldata invoice, bytes calldata signature) internal view returns (bool) {
        bytes32 structHash = keccak256(
            abi.encode(INVOICE_TYPEHASH, invoice.correlationId, invoice.merchant, invoice.price, invoice.dueTimestamp)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        address recovered = _recover(digest, signature);
        return recovered == invoiceSigner;
    }

    function _recover(bytes32 digest, bytes calldata signature) internal pure returns (address) {
        if (signature.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }

    function _calculateFees(uint256 principalOutstanding, uint256 originalPrincipal, uint64 dueTimestamp)
        internal
        view
        returns (uint256)
    {
        uint256 lateStart = uint256(dueTimestamp) + GRACE_PERIOD;
        if (block.timestamp <= lateStart) return 0;

        uint256 secondsLate = block.timestamp - lateStart;
        uint256 daysLate = (secondsLate / 1 days) + 1;

        uint256 penaltyCandidate = (principalOutstanding * PENALTY_BPS_PER_DAY * daysLate) / BPS_DENOM;
        uint256 cap = (originalPrincipal * PENALTY_CAP_BPS) / BPS_DENOM;

        uint256 feeCandidate = LATE_FEE + penaltyCandidate;
        return feeCandidate < cap ? feeCandidate : cap;
    }
}

