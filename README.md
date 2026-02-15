# YieldDiscount BNPL (Tempo Hackathon MVP)

## Judge-Facing Summary

YieldDiscount BNPL is a pay-later checkout where the borrower locks stablecoin collateral and the protocol pays the merchant upfront from a lending pool. A portion of the collateral can be delegated to a strategy wallet and traded on Tempo's native stablecoin DEX. Only realized profit is harvested and applied as a discount on the borrower's repayment amount.

In one sentence: **"Over-collateralized BNPL + realized-yield-to-discount on Tempo."**

### Problem and Approach

BNPL is typically underwritten offchain, which adds credit risk and operational overhead. This MVP explores a different primitive: **fully onchain, over-collateralized BNPL** where the protocol can generate yield from a bounded, opt-in slice of collateral and share it back to the consumer as a **repayment discount**.

### Why This Matters

- **Consumer UX**: "0% interest" within the due window, with the possibility of a discount from realized yield.
- **Merchant UX**: instant payout at checkout (borrower does not transfer directly to the merchant).
- **Protocol UX**: conservative by construction (only investable collateral is delegated; reserved collateral stays in the vault).
- **Tempo-native**: uses TIP-20 stablecoins and Tempo-native DEX actions via `viem/tempo`.

### What Works in the MVP

- Merchant API + SDK: create invoice with idempotency, get a checkout URL, fetch status by `invoiceId` or `correlationId`.
- Checkout (Privy): login, approve AlphaUSD, `openLoan`, view loan state, `repay` with discount preview.
- Keeper CLI (operator): `delegateInvestableToStrategy`, DEX flip order + unwind (best-effort), `harvestProfit`, `returnStrategyPrincipal`, `liquidate`.

### Key Technical Details (What to Look For)

- **Tamper-resistant invoices**: Merchant API signs `InvoiceData` via **EIP-712**; Checkout submits `(invoiceData, signature)` to `LoanManager.openLoan`, preventing client-side price/merchant/due tampering.
- **Clean accounting separation**:
  - `LendingPool`: share-based deposits/withdrawals, `totalAssets = cash + receivables`.
  - `LoanManager`: BNPL ledger (`openLoan/repay/liquidate`) + receivables + profit accounting.
  - `CollateralVault`: holds borrower collateral; only the investable slice can be released to the strategy wallet.
  - `DiscountVault`: holds harvested realized profit and pays discounts back to the pool.
- **Realized-yield-only discount**: discounts are funded only by `harvestProfit(profitAmount)` transfers into `DiscountVault` (no mark-to-market).
- **Strategy pool accounting**: profits are distributed via `accProfitPerShare`/`rewardDebt` with a `profitCredit` buffer to preserve already-accrued profit across share decreases.
- **Tempo-native integration**: Keeper uses `viem/tempo` Actions (`Actions.dex.*`, `Actions.faucet.*`) against Tempo's stablecoin DEX and faucet RPC.

### MVP Scope Notes

- This is a hackathon MVP: the strategy is **best-effort** and run manually via Keeper CLI (no autonomous bot loop, no risk/oracle layer).
- Security/risk controls are intentionally minimal for demo velocity (single operator role, no advanced monitoring).

### End-to-End Flow (High Level)

```mermaid
flowchart TB
  subgraph Offchain
    M[Merchant Demo] -->|SDK| API["Protocol Web: Merchant API"]
    C["Consumer (Privy)"] --> UI["Protocol Web: Checkout UI"]
    K[Keeper CLI] --> RPC[Tempo RPC]
    API --> DB[(SQLite / Prisma)]
  end

  subgraph Onchain["Tempo Moderato (EVM + Native DEX)"]
    Pool[LendingPool]
    Loan[LoanManager]
    CV[CollateralVault]
    DV[DiscountVault]
    Dex[Native Stablecoin DEX]
    Tip20[TIP-20 AlphaUSD/pathUSD]
  end

  API -->|EIP-712 invoice signature| UI
  UI -->|openLoan| Loan
  Loan -->|payMerchant| Pool
  Loan --> CV
  K -->|delegate/harvest/return| Loan
  CV -->|release investable| K
  K -->|placeFlip/unwind| Dex
  Loan -->|harvested profit| DV
  DV -->|payToPool (discount)| Pool
  Tip20 --- Pool
  Tip20 --- CV
  Tip20 --- DV
  Tip20 --- Dex
```

---

This repository contains a single monorepo for:

- Protocol Web (Next.js UI + API)
- Merchant Demo (Next.js)
- Keeper (Node.js / TS)
- Contracts (Solidity / Foundry)
- DB (SQLite / Prisma)

## Prerequisites

- Node.js `>=22`
- `pnpm` (this repo uses workspaces)
- Foundry (`forge`)

## Setup

```bash
pnpm install
cp .env.example .env

# If you keep a single .env at repo root, export it into your shell so workspace apps can read it:
set -a
source .env
set +a

mkdir -p .data
pnpm db:migrate:dev
pnpm db:seed
```

Notes:

- Prisma resolves SQLite `file:` paths relative to `prisma/schema.prisma`, so the default is
  `DATABASE_URL=file:../.data/app.db` (DB file ends up at repo root `.data/app.db`).

## Contracts

```bash
pnpm contracts:build
pnpm contracts:test
pnpm sync:abis
```

### Deploy (Tempo Moderato testnet)

The Foundry deploy script wires roles and prints contract addresses.

```bash
cd contracts

# Required
export TEMPO_RPC_URL="${TEMPO_RPC_URL:-https://rpc.moderato.tempo.xyz}"
export ALPHA_USD_ADDRESS="${ALPHA_USD_ADDRESS:-0x20c0000000000000000000000000000000000001}"

# Optional role overrides (defaults to deployer EOA)
export OPERATOR_ADDRESS="0x..."
export STRATEGY_WALLET_ADDRESS="0x..."
export INVOICE_SIGNER_ADDRESS="0x..."

export DEPLOYER_PRIVATE_KEY="0x..."

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$TEMPO_RPC_URL" \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  --broadcast
```

Then copy the printed addresses into `.env`:

- `LENDING_POOL_ADDRESS`
- `COLLATERAL_VAULT_ADDRESS`
- `DISCOUNT_VAULT_ADDRESS`
- `LOAN_MANAGER_ADDRESS`

## Run (dev)

```bash
pnpm dev
```

- Protocol Web: http://localhost:3000
- Merchant Demo: http://localhost:3001

## Keeper CLI (manual ops)

All commands use `KEEPER_PRIVATE_KEY` and require contract addresses in `.env`.

```bash
set -a
source .env
set +a

pnpm --filter keeper cli --help

# Fund keeper address on Tempo testnet (tempo_fundAddress)
pnpm --filter keeper cli faucet

# Fund another address (e.g. Borrower wallet shown in Checkout)
pnpm --filter keeper cli faucet --address 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef

# Approve LoanManager to pull from Strategy Wallet (needed for harvest/return-principal)
pnpm --filter keeper cli approve --spender "$LOAN_MANAGER_ADDRESS" --amount max

# Approve Pool to pull from Lender (needed for pool-deposit)
pnpm --filter keeper cli approve --spender "$LENDING_POOL_ADDRESS" --amount max

# Deposit to pool (lender)
pnpm --filter keeper cli pool-deposit --amount 10000

# Delegate investable collateral (operator)
pnpm --filter keeper cli delegate --loanId 0x...

# DEX ops (best-effort)
pnpm --filter keeper cli dex-addresses
pnpm --filter keeper cli place-flip --amount 350 --type buy --tick 0.999 --flipTick 1.001
pnpm --filter keeper cli unwind --orderId 123

# Accounting ops (operator)
pnpm --filter keeper cli harvest --amount 5
pnpm --filter keeper cli return-principal --loanId 0x... --amount 350
```

## E2E Demo (MVP)

This is the runbook that matches the steering docs (`price=1000`, `collateralDeposit=1600`).

1. Ensure `.env` is filled (Privy, keys, contract addresses). Run `pnpm dev`.
2. Fund accounts:
   - Fund Keeper (`KEEPER_PRIVATE_KEY`) with `pnpm --filter keeper cli faucet`
   - In Checkout UI, login with Privy and copy the Borrower wallet address shown on screen.
   - Fund Borrower with `pnpm --filter keeper cli faucet --address <borrower>`
3. Pool funding (Lender):
   - `pnpm --filter keeper cli approve --spender "$LENDING_POOL_ADDRESS" --amount max`
   - `pnpm --filter keeper cli pool-deposit --amount 10000`
4. Create invoice:
   - Open Merchant Demo (http://localhost:3001) and click “Purchase with BNPL”.
   - You should be redirected to Checkout (http://localhost:3000/checkout/<correlationId>).
5. Borrower opens loan (Checkout UI):
   - Click “Approve Max” (approves AlphaUSD -> LoanManager).
   - Set `collateralDeposit=1600` and click “Open Loan”.
6. Operator/Keeper runs strategy ops (CLI):
   - `pnpm --filter keeper cli delegate --loanId <correlationId>`
   - Place DEX flip order (best-effort) and unwind:
     - `pnpm --filter keeper cli place-flip --amount <investableCollateral>`
     - `pnpm --filter keeper cli unwind --orderId <orderId>`
   - Realize profit and return principal:
     - `pnpm --filter keeper cli approve --spender "$LOAN_MANAGER_ADDRESS" --amount max`
     - `pnpm --filter keeper cli harvest --amount 5`
     - `pnpm --filter keeper cli return-principal --loanId <correlationId> --amount <investableCollateral>`
7. Borrower repays (Checkout UI):
   - Set `repayTargetAmount=1000` and click “Repay”.
   - Confirm discount is applied (`borrowerPayAmount = repayTargetAmount - discountApplied`).

Optional: verify Merchant API status (Bearer auth):

```bash
curl -sS \
  -H "Authorization: Bearer $DEMO_MERCHANT_API_KEY" \
  "http://localhost:3000/api/merchant/invoices/by-correlation/<correlationId>"
```

## Env Vars

See `.env.example` and `docs/architecture.md`.
