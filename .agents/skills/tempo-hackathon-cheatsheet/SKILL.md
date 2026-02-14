---
name: tempo-hackathon-cheatsheet
description: Cheatsheet for building on Tempo network during hackathon. Covers consumer payments, stablecoin infrastructure, and AI agents with code snippets and best practices.
---

## Setup & Prerequisites

### Network Connection

[See more here](https://docs.tempo.xyz/quickstart/connection-details#direct-connection-details)

| Property           | Value                                           |
| ------------------ | ----------------------------------------------- |
| **Network Name**   | Tempo Testnet (Moderato)                        |
| **Chain ID**       | **42431**                                       |
| **Currency**       | `USD`                                           |
| **RPC URL**        | `https://rpc.moderato.tempo.xyz`                |
| **Block Explorer** | [explore.tempo.xyz](https://explore.tempo.xyz/) |

### Installation

```bash
npm install tempo.ts viem @privy-io/react-auth @tanstack/react-query

```

### Testnet Tokens

| Token               | Address                                      |
| ------------------- | -------------------------------------------- |
| AlphaUSD            | `0x20c0000000000000000000000000000000000001` |
| BetaUSD             | `0x20c0000000000000000000000000000000000002` |
| pathUSD (DEX quote) | `0x20c0000000000000000000000000000000000000` |

### Client Setup (Viem)

```tsx
import { createClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoTestnet } from "viem/chains";
import { tempoActions } from "viem/tempo";

const client = createClient({
  account: privateKeyToAccount("0x..."),
  chain: tempoTestnet,
  transport: http(),
}).extend(tempoActions());
```

### Client Setup (Wagmi)

```tsx
import { createConfig, http } from "@wagmi/core";
import { tempoTestnet } from "viem/chains";

export const config = createConfig({
  chains: [tempoTestnet],
  transports: {
    [tempoTestnet.id]: http(),
  },
});
```

### Get Testnet Funds

```tsx
import { Actions } from "tempo.ts/wagmi";

const { receipt } = await Actions.faucet.fundSync(config, {
  account: "0x...",
});
```

## Test Wallets

<aside>
💡

These are a community resource, so please do not abuse. You can always spin up your own wallets.

</aside>

Each of these wallets have 1,000,000 of BetaUSD, AlphaUSD, ThetaUSD and PathUSD.

```jsx
---

Wallet 1 ---
Address: 0x031891A61200FedDd622EbACC10734BC90093B2A
Private Key: 0x2b9e3b8a095940cf3461e27bfb2bebb498df9a6381b76b9f9c48c9bbdc3c8192

```

```jsx
--- Wallet 2 ---
Address: 0xAcF8dBD0352a9D47135DA146EA5DbEfAD58340C4
Private Key: 0xf3c009932cfe5e0b20db6c959e28e3546047cf70309d0f2ac5d38ee14527739a
```

```jsx
—- Wallet 3 ---
Address: 0x41A75fc9817AF9F2DB0c0e58C71Bc826339b3Acb
Private Key: 0xf804bb2ff55194ce6a62de31219d08fff6fd67fbaa68170e3dc8234035cad108
```

```jsx
--- Wallet 4 ---
Address: 0x88FB1167B01EcE2CAEe65c4E193Ba942D6F73d70
Private Key: 0xb0803108bb5ce052f7f50655d0078af5c8edfe48a6ffa7b3e8b2add0292cffc9
```

```jsx
--- Wallet 5 ---
Address: 0xe945797ebC84F1953Ff8131bC29277e567b881D4
Private Key: 0x097761d893afc5d6669c0b99c8d6ca9ce1c2fa88bd84de5a58d28713cd6a7121
```

---

## Track 1: Consumer Payments

### Privy: Server-Side User Lookup

Look up or create a user by email/phone. Creates an embedded wallet automatically.

```tsx
// /api/find/route.ts
import { PrivyClient } from "@privy-io/node";
import { NextRequest, NextResponse } from "next/server";

const privy = new PrivyClient({
  appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

export async function POST(request: NextRequest) {
  const { identifier } = await request.json();
  const user = await getOrCreateUser(identifier);

  const wallet = user.linked_accounts?.find(
    (account) => account.type === "wallet" && account.chain_type === "ethereum",
  );

  return NextResponse.json({
    address: wallet?.address,
    identifier,
    isNewUser: !user.linked_accounts?.length,
  });
}

async function getOrCreateUser(identifier: string) {
  const isEmail = identifier.includes("@");

  // Try to find existing user
  const existingUser = isEmail
    ? await privy
        .users()
        .getByEmailAddress({ address: identifier })
        .catch(() => null)
    : await privy
        .users()
        .getByPhoneNumber({ number: identifier })
        .catch(() => null);

  if (existingUser) return existingUser;

  // Create new user with embedded wallet
  return privy.users().create({
    linked_accounts: isEmail
      ? [{ type: "email", address: identifier }]
      : [{ type: "phone", number: identifier }],
    wallets: [{ chain_type: "ethereum" }],
  });
}
```

### Privy: Client-Side Send Hook

```tsx
// hooks/useSend.ts
import { createWalletClient, custom, parseUnits, stringToHex, pad } from "viem";
import { tempoTestnet } from "viem/chains";
import { tempoActions } from "viem/tempo";
import { useWallets } from "@privy-io/react-auth";

export function useSend() {
  const { wallets } = useWallets();

  const send = async (to: string, amount: string, memo: string = "") => {
    const wallet = wallets[0];
    if (!wallet) throw new Error("No wallet connected");

    // Resolve email/phone to address via Privy
    const { address: recipient } = await fetch("/api/find", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: to }),
    }).then((res) => res.json());

    // Create Tempo client with Privy provider
    const provider = await wallet.getEthereumProvider();
    const client = createWalletClient({
      account: wallet.address as `0x${string}`,
      chain: tempoTestnet,
      transport: custom(provider),
    }).extend(tempoActions());

    // Send payment with memo
    const { receipt } = await client.token.transferSync({
      to: recipient,
      amount: parseUnits(amount, 6),
      token: "0x20c0000000000000000000000000000000000001",
      memo: memo ? pad(stringToHex(memo), { size: 32 }) : undefined,
    });

    return receipt.transactionHash;
  };

  return { send };
}
```

### React: Payment Form Component

```tsx
import { Hooks } from "tempo.ts/wagmi";
import { parseUnits, stringToHex, pad } from "viem";

function SendPayment() {
  const sendPayment = Hooks.token.useTransferSync();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    sendPayment.mutate({
      amount: parseUnits(formData.get("amount") as string, 6),
      to: formData.get("recipient") as `0x${string}`,
      token: "0x20c0000000000000000000000000000000000001",
      memo: pad(stringToHex((formData.get("memo") as string) || ""), {
        size: 32,
      }),
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="recipient" placeholder="Email, phone, or 0x..." required />
      <input
        name="amount"
        type="number"
        step="0.01"
        placeholder="100.00"
        required
      />
      <input name="memo" placeholder="Dinner last night - thanks!" />

      <button type="submit" disabled={sendPayment.isPending}>
        {sendPayment.isPending ? "Sending..." : "Send Payment"}
      </button>

      {sendPayment.data && (
        <a
          href={`https://explore.tempo.xyz/tx/${sendPayment.data.receipt.transactionHash}`}
        >
          View on Explorer
        </a>
      )}

      {sendPayment.error && (
        <div className="error">{sendPayment.error.message}</div>
      )}
    </form>
  );
}
```

### Basic Transfer with Memo

```tsx
import { parseUnits, stringToHex, pad } from "viem";

// Simple transfer
const { receipt } = await client.token.transferSync({
  amount: parseUnits("100", 6),
  to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb",
  token: "0x20c0000000000000000000000000000000000001",
});

// Transfer with memo (for reconciliation)
const invoiceId = pad(stringToHex("INV-12345"), { size: 32 });

const { receipt } = await client.token.transferSync({
  amount: parseUnits("100", 6),
  to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb",
  token: "0x20c0000000000000000000000000000000000001",
  memo: invoiceId,
});
```

### Fee Sponsorship (Gasless Transactions)

```tsx
// Option 1: Use configured fee payer service
const { receipt } = await client.token.transferSync({
  amount: parseUnits("100", 6),
  to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb",
  token: "0x20c0000000000000000000000000000000000001",
  feePayer: true, // Uses <https://sponsor.testnet.tempo.xyz>
});

// Option 2: Sponsor with specific account
import { privateKeyToAccount } from "viem/accounts";

const sponsorAccount = privateKeyToAccount("0x...");

const { receipt } = await client.token.transferSync({
  amount: parseUnits("100", 6),
  to: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEbb",
  token: "0x20c0000000000000000000000000000000000001",
  feePayer: sponsorAccount,
});
```

### Parallel Transactions (2D Nonces)

```tsx
import { Actions } from "tempo.ts/wagmi";
import { parseUnits } from "viem";

const alphaUsd = "0x20c0000000000000000000000000000000000001";

// Option 1: Random nonce keys (simple, slightly more gas)
const [hash1, hash2, hash3] = await Promise.all([
  Actions.token.transfer(config, {
    amount: parseUnits("100", 6),
    to: "0xRecipient1...",
    token: alphaUsd,
    nonceKey: "random",
  }),
  Actions.token.transfer(config, {
    amount: parseUnits("50", 6),
    to: "0xRecipient2...",
    token: alphaUsd,
    nonceKey: "random",
  }),
  Actions.token.transfer(config, {
    amount: parseUnits("75", 6),
    to: "0xRecipient3...",
    token: alphaUsd,
    nonceKey: "random",
  }),
]);

// Option 2: Explicit nonce keys (more gas efficient for high-throughput)
const account = "0x...";

const [nonce1, nonce2] = await Promise.all([
  Actions.nonce.getNonce(config, { account, nonceKey: 1n }),
  Actions.nonce.getNonce(config, { account, nonceKey: 2n }),
]);

const [hash1, hash2] = await Promise.all([
  Actions.token.transfer(config, {
    amount: parseUnits("100", 6),
    to: "0xRecipient1...",
    token: alphaUsd,
    nonceKey: 1n,
    nonce: Number(nonce1),
  }),
  Actions.token.transfer(config, {
    amount: parseUnits("50", 6),
    to: "0xRecipient2...",
    token: alphaUsd,
    nonceKey: 2n,
    nonce: Number(nonce2),
  }),
]);
```

### Batch Transactions (Atomic)

```tsx
import { encodeFunctionData, parseUnits } from "viem";
import { Abis } from "viem/tempo";

const tokenABI = Abis.tip20;
const alphaUsd = "0x20c0000000000000000000000000000000000001";

// All transfers succeed or all fail together
const hash = await client.sendTransaction({
  calls: [
    {
      to: alphaUsd,
      data: encodeFunctionData({
        abi: tokenABI,
        functionName: "transfer",
        args: ["0xRecipient1...", parseUnits("100", 6)],
      }),
    },
    {
      to: alphaUsd,
      data: encodeFunctionData({
        abi: tokenABI,
        functionName: "transfer",
        args: ["0xRecipient2...", parseUnits("50", 6)],
      }),
    },
    {
      to: alphaUsd,
      data: encodeFunctionData({
        abi: tokenABI,
        functionName: "transfer",
        args: ["0xRecipient3...", parseUnits("75", 6)],
      }),
    },
  ],
});
```

### Watch Incoming Payments

```tsx
import { parseEventLogs } from "viem";
import { Abis } from "viem/tempo";

// Watch for payments with memo (for reconciliation)
const unwatch = client.watchEvent({
  address: "0x20c0000000000000000000000000000000000001",
  event: {
    type: "event",
    name: "TransferWithMemo",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256" },
      { name: "memo", type: "bytes32", indexed: true },
    ],
  },
  onLogs: (logs) => {
    logs.forEach((log) => {
      if (log.args.to === myAddress) {
        const invoiceId = log.args.memo;
        const amount = log.args.value;
        markInvoiceAsPaid(invoiceId, amount);
      }
    });
  },
});

// Cleanup
unwatch();
```

---

## Track 2: Stablecoin Infrastructure

### Tick System Basics

```tsx
import { Tick } from "tempo.ts/viem";

// Price ↔ Tick conversion
Tick.fromPrice("1.001"); // 100  (0.1% above peg)
Tick.toPrice(100); // "1.001"
Tick.fromPrice("0.999"); // -100 (0.1% below peg)
Tick.toPrice(-100); // "0.999"

// Constants
Tick.minTick; // -2000 (price = 0.98)
Tick.maxTick; // 2000  (price = 1.02)
Tick.priceScale; // 100_000
```

### Execute Swap (Exact Input)

```tsx
import { Actions } from "tempo.ts/viem";
import { parseUnits } from "viem";

const alphaUsd = "0x20c0000000000000000000000000000000000001";
const betaUsd = "0x20c0000000000000000000000000000000000002";

// Get quote
const amountOut = await Actions.dex.getSellQuote(client, {
  tokenIn: alphaUsd,
  tokenOut: betaUsd,
  amountIn: parseUnits("1000", 6),
});

// Execute with 0.5% slippage protection
const minAmountOut = (amountOut * 995n) / 1000n;

const { receipt } = await Actions.dex.sellSync(client, {
  tokenIn: alphaUsd,
  tokenOut: betaUsd,
  amountIn: parseUnits("1000", 6),
  minAmountOut,
});
```

### Execute Swap (Exact Output)

```tsx
// I want exactly 1000 BetaUSD
const amountIn = await Actions.dex.getBuyQuote(client, {
  tokenIn: alphaUsd,
  tokenOut: betaUsd,
  amountOut: parseUnits("1000", 6),
});

// Add 0.5% slippage tolerance
const maxAmountIn = (amountIn * 1005n) / 1000n;

const { receipt } = await Actions.dex.buySync(client, {
  tokenIn: alphaUsd,
  tokenOut: betaUsd,
  amountOut: parseUnits("1000", 6),
  maxAmountIn,
});
```

### Place Limit Order

```tsx
import { Actions, Tick } from "tempo.ts/viem";
import { parseUnits } from "viem";

// Place buy order at 0.1% below peg
const { orderId, receipt } = await Actions.dex.placeSync(client, {
  token: "0x20c0000000000000000000000000000000000001",
  amount: parseUnits("500", 6),
  type: "buy",
  tick: Tick.fromPrice("0.999"),
});

console.log("Order placed:", orderId);

// Cancel order
const { receipt: cancelReceipt } = await Actions.dex.cancelSync(client, {
  orderId,
});
```

### Place Flip Order (Market Making)

```tsx
import { Actions, Tick } from "tempo.ts/viem";
import { parseUnits } from "viem";

// Buy at 0.999, auto-sell at 1.001 when filled
const { orderId } = await Actions.dex.placeFlipSync(client, {
  token: "0x20c0000000000000000000000000000000000001",
  amount: parseUnits("1000", 6),
  type: "buy",
  tick: Tick.fromPrice("0.999"),
  flipTick: Tick.fromPrice("1.001"),
});

// The order will:
// 1. Buy 1000 tokens at 0.999
// 2. When filled, automatically place SELL at 1.001
// 3. Continue flipping, capturing 0.2% spread
```

### Query Orderbook

```tsx
import { Actions, Tick } from "tempo.ts/viem";

const base = "0x20c0000000000000000000000000000000000001";
const quote = "0x20c0000000000000000000000000000000000000";

// Get orderbook state
const book = await Actions.dex.getOrderbook(client, { base, quote });
console.log("Best bid:", Tick.toPrice(book.bestBidTick));
console.log("Best ask:", Tick.toPrice(book.bestAskTick));

// Get liquidity at specific price
const level = await Actions.dex.getTickLevel(client, {
  base,
  tick: Tick.fromPrice("1.001"),
  isBid: false,
});
console.log("Liquidity:", level.totalLiquidity);

// Get order details
const order = await Actions.dex.getOrder(client, { orderId: 123n });

// Get paginated orders with filters
const { orders, nextCursor } = await Actions.dex.getOrders(client, {
  limit: 100,
  filters: {
    baseToken: base,
    isBid: true,
    maker: "0x...",
  },
});
```

### Watch DEX Events

```tsx
import { Actions } from "tempo.ts/viem";

// Watch order fills
const unwatch = Actions.dex.watchOrderFilled(client, {
  onOrderFilled: (args, log) => {
    console.log(`Order ${args.orderId} filled:`, args.amountFilled);
  },
});

// Watch new orders
Actions.dex.watchOrderPlaced(client, {
  token: base,
  onOrderPlaced: (args, log) => {
    console.log(`New order: ${args.orderId} @ tick ${args.tick}`);
  },
});

// Watch flip orders
Actions.dex.watchFlipOrderPlaced(client, {
  onFlipOrderPlaced: (args, log) => {
    console.log(`Flip: buy ${args.tick}, sell ${args.flipTick}`);
  },
});
```

### Create TIP-20 Stablecoin

```tsx
import { Actions } from "tempo.ts/viem";
import { parseUnits } from "viem";

// Create token
const { receipt, tokenId, tokenAddress } = await Actions.token.createSync(
  client,
  {
    name: "My USD Stablecoin",
    symbol: "MYUSD",
    decimals: 6,
    currency: "USD", // Enables DEX pairing and fee payment
  },
);

// Grant minting role
await Actions.token.grantRoleSync(client, {
  token: tokenAddress,
  role: "issuer",
  account: "0xMinterAddress...",
});

// Mint tokens
await Actions.token.mintSync(client, {
  token: tokenAddress,
  to: "0xRecipient...",
  amount: parseUnits("1000000", 6),
});
```

### Solidity: Payment Processor Contract

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITIP20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferWithMemo(address to, uint256 amount, bytes32 memo) external;
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IStablecoinExchange {
    function swapExactAmountIn(
        address tokenIn,
        address tokenOut,
        uint128 amountIn,
        uint128 minAmountOut
    ) external returns (uint128 amountOut);

    function quoteSwapExactAmountIn(
        address tokenIn,
        address tokenOut,
        uint128 amountIn
    ) external view returns (uint128 amountOut);
}

contract PaymentProcessor {
    ITIP20 public immutable token;
    IStablecoinExchange public immutable dex;

    mapping(bytes32 => bool) public paidInvoices;

    event PaymentReceived(
        address indexed payer,
        uint256 amount,
        bytes32 indexed invoiceId
    );

    constructor(address _token, address _dex) {
        token = ITIP20(_token);
        dex = IStablecoinExchange(_dex);
    }

    function payInvoice(bytes32 invoiceId, uint256 amount) external {
        require(!paidInvoices[invoiceId], "Already paid");

        token.transferWithMemo(address(this), amount, invoiceId);
        paidInvoices[invoiceId] = true;

        emit PaymentReceived(msg.sender, amount, invoiceId);
    }

    // Accept any stablecoin, auto-convert to preferred token
    function payInvoiceAnyToken(
        bytes32 invoiceId,
        address paymentToken,
        uint128 paymentAmount,
        uint128 minReceived
    ) external {
        require(!paidInvoices[invoiceId], "Already paid");

        ITIP20(paymentToken).transferFrom(msg.sender, address(this), paymentAmount);

        uint128 received = dex.swapExactAmountIn(
            paymentToken,
            address(token),
            paymentAmount,
            minReceived
        );

        paidInvoices[invoiceId] = true;
        emit PaymentReceived(msg.sender, received, invoiceId);
    }
}

```

---

## Track 3: AI Agents & Automation

### Create Agent Wallet

```tsx
import { createClient, http } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { tempoTestnet } from "viem/chains";
import { tempoActions } from "viem/tempo";

function createAgentWallet() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  const client = createClient({
    account,
    chain: tempoTestnet,
    transport: http(),
  }).extend(tempoActions());

  return { client, account, privateKey };
}

const agent = createAgentWallet();
console.log("Agent address:", agent.account.address);
```

### Agent-to-Agent Payments

```tsx
import { parseUnits, stringToHex, pad } from "viem";

interface AgentServiceRequest {
  serviceAgent: `0x${string}`;
  service: string;
  requestId: string;
  price: bigint;
}

async function payForAgentService(
  client: ReturnType<typeof createClient>,
  request: AgentServiceRequest,
) {
  const memo = pad(
    stringToHex(`agent:${request.service}:${request.requestId}`),
    { size: 32 },
  );

  const { receipt } = await client.token.transferSync({
    to: request.serviceAgent,
    amount: request.price,
    token: "0x20c0000000000000000000000000000000000001",
    memo,
  });

  return {
    txHash: receipt.transactionHash,
    requestId: request.requestId,
  };
}

// Example: Pay data provider $0.10 per request
await payForAgentService(agentClient, {
  serviceAgent: "0xDataProviderAgent...",
  service: "weather-forecast-7day",
  requestId: "req_abc123",
  price: parseUnits("0.10", 6),
});
```

### Autonomous Trading Agent

```tsx
import { Actions, Tick } from "tempo.ts/viem";
import { parseUnits } from "viem";

interface TradingSignal {
  action: "buy" | "sell" | "hold";
  token: `0x${string}`;
  amount: bigint;
  confidence: number;
  reasoning: string;
}

async function executeTradingAgent(
  client: ReturnType<typeof createClient>,
  signal: TradingSignal,
) {
  if (signal.confidence < 0.8 || signal.action === "hold") {
    return { executed: false, reason: "Low confidence or hold" };
  }

  const quote = "0x20c0000000000000000000000000000000000000";

  if (signal.action === "buy") {
    const amountIn = await Actions.dex.getBuyQuote(client, {
      tokenIn: quote,
      tokenOut: signal.token,
      amountOut: signal.amount,
    });

    const maxAmountIn = (amountIn * 1005n) / 1000n;

    const { receipt } = await Actions.dex.buySync(client, {
      tokenIn: quote,
      tokenOut: signal.token,
      amountOut: signal.amount,
      maxAmountIn,
    });

    return {
      executed: true,
      action: "buy",
      txHash: receipt.transactionHash,
      reasoning: signal.reasoning,
    };
  }

  if (signal.action === "sell") {
    const amountOut = await Actions.dex.getSellQuote(client, {
      tokenIn: signal.token,
      tokenOut: quote,
      amountIn: signal.amount,
    });

    const minAmountOut = (amountOut * 995n) / 1000n;

    const { receipt } = await Actions.dex.sellSync(client, {
      tokenIn: signal.token,
      tokenOut: quote,
      amountIn: signal.amount,
      minAmountOut,
    });

    return {
      executed: true,
      action: "sell",
      txHash: receipt.transactionHash,
      reasoning: signal.reasoning,
    };
  }
}

// Trading loop
async function runTradingLoop() {
  while (true) {
    const signal = await getAITradingSignal();
    const result = await executeTradingAgent(agentClient, signal);

    await logAgentDecision({
      timestamp: Date.now(),
      signal,
      result,
    });

    await sleep(60_000);
  }
}
```

### Subscription Agent

```tsx
import { parseUnits, stringToHex, pad } from "viem";

interface Subscription {
  id: string;
  recipient: `0x${string}`;
  amount: bigint;
  token: `0x${string}`;
  intervalMs: number;
  lastPayment: number;
  active: boolean;
}

class SubscriptionAgent {
  private subscriptions: Map<string, Subscription> = new Map();

  constructor(private client: ReturnType<typeof createClient>) {}

  addSubscription(sub: Omit<Subscription, "lastPayment">) {
    this.subscriptions.set(sub.id, { ...sub, lastPayment: 0 });
  }

  async processPayments() {
    const now = Date.now();

    for (const [id, sub] of this.subscriptions) {
      if (!sub.active) continue;
      if (now - sub.lastPayment < sub.intervalMs) continue;

      try {
        const { receipt } = await this.client.token.transferSync({
          to: sub.recipient,
          amount: sub.amount,
          token: sub.token,
          memo: pad(stringToHex(`subscription:${id}`), { size: 32 }),
        });

        sub.lastPayment = now;
        console.log(`Subscription ${id} paid:`, receipt.transactionHash);
      } catch (error) {
        console.error(`Failed: ${id}`, error);
      }
    }
  }

  async runLoop(checkIntervalMs = 60_000) {
    while (true) {
      await this.processPayments();
      await sleep(checkIntervalMs);
    }
  }
}

// Usage
const subAgent = new SubscriptionAgent(agentClient);

subAgent.addSubscription({
  id: "netflix",
  recipient: "0xNetflix...",
  amount: parseUnits("15.99", 6),
  token: "0x20c0000000000000000000000000000000000001",
  intervalMs: 30 * 24 * 60 * 60 * 1000, // Monthly
  active: true,
});

subAgent.runLoop();
```

### Pay-per-API-Call Service

```tsx
import { parseUnits, stringToHex, pad, parseEventLogs } from "viem";
import { Abis } from "viem/tempo";

const API_WALLET = "0x...";
const PRICE_PER_CALL = parseUnits("0.001", 6); // $0.001

// Server: Verify payment before processing
async function handlePaidAPIRequest(req: Request) {
  const { paymentTx, query } = await req.json();

  const receipt = await client.getTransactionReceipt({ hash: paymentTx });

  const logs = parseEventLogs({
    abi: Abis.tip20,
    logs: receipt.logs,
    eventName: "TransferWithMemo",
  });

  const payment = logs[0];
  if (!payment || payment.args.to !== API_WALLET) {
    throw new Error("Invalid payment");
  }

  if (payment.args.value < PRICE_PER_CALL) {
    throw new Error("Insufficient payment");
  }

  const result = await processQuery(query);
  return Response.json({ result });
}

// Client: Pay then call
async function callPaidAPI(query: string) {
  const requestId = crypto.randomUUID();

  const { receipt } = await client.token.transferSync({
    to: API_WALLET,
    amount: PRICE_PER_CALL,
    token: "0x20c0000000000000000000000000000000000001",
    memo: pad(stringToHex(`api:${requestId}`), { size: 32 }),
  });

  const response = await fetch(API_ENDPOINT, {
    method: "POST",
    body: JSON.stringify({
      paymentTx: receipt.transactionHash,
      query,
    }),
  });

  return response.json();
}
```

---

## Quick Reference

### Common Imports

```tsx
// Viem
import {
  createClient,
  http,
  parseUnits,
  formatUnits,
  stringToHex,
  pad,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { tempoTestnet } from "viem/chains";
import { tempoActions, Abis } from "viem/tempo";

// Tempo SDK
import { Actions, Tick } from "tempo.ts/viem";
import { Hooks } from "tempo.ts/wagmi";

// Privy
import { PrivyClient } from "@privy-io/node";
import { useWallets, PrivyProvider } from "@privy-io/react-auth";
```

### Token Addresses (Testnet)

```tsx
const TOKENS = {
  alphaUsd: "0x20c0000000000000000000000000000000000001",
  betaUsd: "0x20c0000000000000000000000000000000000002",
  pathUsd: "0x20c0000000000000000000000000000000000000",
};
```

### Contract Addresses (Testnet)

```tsx
import { Addresses } from "viem/tempo";

Addresses.stablecoinExchange; // DEX
Addresses.tip20Factory; // Token factory
Addresses.tip403Registry; // Policy registry
```
