# YieldDiscount BNPL (Tempo Hackathon MVP)

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
