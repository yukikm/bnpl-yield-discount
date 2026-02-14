---
name: tempo-hackathon-problem-statements
description: Problem statements and project ideas for the Tempo Hackathon. Organized into three tracks: Consumer Payments & Social Finance, Stablecoin Infrastructure, and AI Agents & Automation. Use this as a guide to brainstorm and structure your hackathon projects on the Tempo network.
---

# Track 1: Consumer Payments & Social Finance

<aside>
💡

We require you to use **Privy** for your wallet infrastructure in this track! See Privy’s example P2P payments app built with Tempo transactions [here](https://github.com/privy-io/examples/tree/main/examples/privy-next-tempo).

</aside>

### Description

Build consumer-grade financial applications where users never need to know they're using crypto. This track leverages **Privy's email/phone authentication** to enable Venmo-like payment experiences on Tempo's instant stablecoin rails.

### What Privy Enables

Privy provides the critical **email/phone → wallet** mapping that makes consumer UX possible:

- Users sign up with email or phone number
- Wallets are automatically created (no seed phrases)
- Send money to anyone using just their email or phone
- Transaction memos for human-readable payment notes

### Starter Code

```bash
git clone <https://github.com/tempoxyz/examples>
cd examples/privy-next-tempo
```

### Key Features to Leverage

| Feature                  | Use Case                                           |
| ------------------------ | -------------------------------------------------- |
| Privy email/phone lookup | Send to contacts without wallet addresses          |
| Transfer memos           | "Dinner last night - thanks!" attached to payments |
| Fee sponsorship          | Users don't need to hold tokens for gas            |
| Parallel transactions    | Send to multiple recipients simultaneously         |
| Batch transactions       | Atomic group payments (all succeed or all fail)    |

---

### Project Ideas

### Payments & Social

**Group Expense Splitter**

- Splitwise-style app for splitting bills among friends
- Invite friends by email or phone number
- Track who owes what with automatic balance calculations
- One-tap settlement with stablecoin transfers
- Transaction memos showing expense descriptions

**Payment Requests & Invoicing**

- Generate shareable payment links via email/SMS
- QR codes for in-person payment requests
- Automatic notifications when paid
- Invoice history and receipts with memo reconciliation

**Creator Tipping & Monetization**

- Embeddable tip buttons for websites/content
- Tip jar with supporter leaderboard
- Subscription/membership payments
- Revenue splitting for collaborations

### Gaming

**Skill-Based Wagering Platform**

- Challenge friends to games (chess, trivia, poker) with stablecoin stakes
- Invite opponents by email/phone
- Escrow stakes until game completion
- Automatic payout to winners
- Game IDs encoded in transaction memos

**Tournament Prize Pools**

- Collect entry fees from participants
- Bracket/leaderboard management
- Automatic prize distribution based on standings
- Support for multiple tournament formats (single elimination, round robin, etc.)

**In-Game Currency**

- Real stablecoin-backed tokens for game economies
- Instant deposits and withdrawals
- Player-to-player trading
- Marketplace with instant settlement

### Prediction Markets

**Friend Prediction Pools**

- "Who wins the Super Bowl?" - invite friends by phone
- Binary yes/no predictions
- Automatic resolution and payout
- Social leaderboard for bragging rights

**Office/Group Pools**

- March Madness brackets
- Oscar predictions
- Fantasy sports leagues
- Entry fees collected in stablecoins
- Configurable prize distribution (winner-take-all, top 3, etc.)

# Track 2: Stablecoin Infrastructure

### Description

Build the foundational DeFi primitives and infrastructure that power the stablecoin economy. This track focuses on yield, lending, treasury management, and tools that make stablecoins useful beyond simple transfers.

### Tempo DEX Overview

Tempo has a native on-chain limit orderbook DEX for stablecoin trading:

| Concept                | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| **Tick-based pricing** | Prices as ticks (-2000 to +2000), representing ±2% from peg |
| **Flip orders**        | Limit orders that auto-reverse when filled (market making)  |
| **Minimum order**      | $100 USD equivalent                                         |
| **Quote token**        | All tokens trade against pathUSD                            |

### Key Features to Leverage

| Feature           | Use Case                                            |
| ----------------- | --------------------------------------------------- |
| Limit orders      | Provide liquidity at specific prices                |
| Flip orders       | Automated market making with spread capture         |
| Swaps             | Instant stablecoin-to-stablecoin conversion         |
| TIP-20 creation   | Launch your own stablecoin with built-in compliance |
| Role-based access | Separate minting, pausing, and admin permissions    |

---

### Project Ideas

### Yield & Lending

**Stablecoin Yield Aggregator**

- Compare yields across different strategies
- Auto-compound rewards
- Risk scoring for different pools
- Portfolio rebalancing based on yield changes

**Peer-to-Peer Lending**

- Create loan offers with custom terms (rate, duration, collateral)
- Collateral management and liquidation
- Interest accrual and repayment tracking
- Credit scoring based on repayment history

**Fixed-Rate Lending Protocol**

- Term-based lending (30, 60, 90 days)
- Fixed interest rates locked at origination
- Secondary market for loan positions
- Institutional-grade reporting

### Treasury & Corporate

**DAO Treasury Management**

- Multi-sig treasury controls
- Spending proposals and voting
- Budget allocation and tracking
- Yield optimization for idle funds

**Payroll & Disbursements**

- CSV upload for bulk payments
- Recurring payment schedules
- Multi-currency support (auto-convert via DEX)
- Compliance reporting and exports

### On/Off Ramps

**Fiat Gateway Integration**

- Bank account linking
- ACH/wire deposit and withdrawal
- KYC/AML compliance layer
- Real-time conversion rates

**Cross-Border Settlement**

- Multi-currency conversion paths via DEX
- Remittance corridor optimization
- FX rate locking
- Correspondent banking alternative

### DEX Tools (Advanced)

**Market Making Bot**

- Automated flip orders with configurable spreads
- Inventory risk management
- Performance analytics and P&L tracking
- Multi-pair support

**DEX Analytics Dashboard**

- Real-time orderbook depth charts
- Volume and spread analytics
- Historical price data
- Whale watching / large order alerts

**Arbitrage Detection**

- Cross-pair price monitoring
- Profitability calculation (including gas)
- Automatic execution when profitable
- Risk limits and circuit breakers

# Track 3: AI Agents & Automation

### Description

Build autonomous systems that leverage Tempo's instant settlement for AI-powered financial applications. This track explores the intersection of AI agents and programmable money.

### Why Tempo for AI Agents

From Tempo's [agentic commerce documentation](https://docs.tempo.xyz/learn/use-cases/agentic-commerce):

> "Autonomous agents are increasingly able to purchase goods and services, negotiate discounts, and manage everyday tasks without human input. For autonomous agents to function reliably, they need real-time, digitally native money that matches the speed and autonomy of their decisions."

### Key Advantages

| Advantage               | Benefit for Agents                                   |
| ----------------------- | ---------------------------------------------------- |
| **Instant finality**    | No waiting for confirmations                         |
| **No native token**     | Pay fees in the same stablecoin being transferred    |
| **Programmable memos**  | Agent coordination protocols via 32-byte messages    |
| **Wallet provisioning** | Create wallets instantly without issuer partnerships |
| **Policy controls**     | Spending limits and rules enforced on-chain          |

### Key Features to Leverage

| Feature               | Use Case                                    |
| --------------------- | ------------------------------------------- |
| Instant settlement    | Real-time agent-to-agent payments           |
| Memos                 | Service request IDs, coordination protocols |
| DEX access            | Autonomous portfolio management             |
| Parallel transactions | High-throughput payment processing          |
| Fee sponsorship       | Operator-funded agent transactions          |

---

### Project Ideas

### Autonomous Trading

**AI Trading Agent**

- Natural language strategy definition ("buy when RSI < 30")
- Risk management and position limits
- Performance tracking and reporting
- Human oversight and kill switches
- Audit trail of all decisions

**Portfolio Rebalancing Agent**

- Define target portfolio weights
- Automatic rebalancing when drift exceeds threshold
- Tax-loss harvesting opportunities
- Performance attribution

**Arbitrage Detection Agent**

- Cross-pair price monitoring on DEX
- Profitability calculation (including gas)
- Automatic execution when profitable
- Risk limits and circuit breakers

### Payment Automation

**Smart Invoice Agent**

- Automatically categorize incoming payments using AI
- Send payment reminders via email/SMS
- Match payments to invoices using memos
- Generate financial reports

**Subscription Management Agent**

- Monitor subscription renewals
- Automatic payment execution on schedule
- Failure handling and retries
- Usage-based billing calculations

**Expense Approval Agent**

- AI-powered expense categorization
- Route for approval based on rules
- Automatic payment upon approval
- Anomaly detection for fraud prevention

### Agent-to-Agent Commerce

**Agent Service Marketplace**

- Agent registration and capability advertising
- Service discovery and matching
- Reputation and reliability scoring
- Automatic payment settlement via memos

**Multi-Agent Orchestration**

- Task decomposition and assignment
- Inter-agent payment flows
- Result aggregation
- Error handling and fallbacks

### AI-Powered Interfaces

**Natural Language DeFi**

- Chat interface for Tempo operations
- "What's my portfolio worth?"
- "Swap $100 of AlphaUSD for BetaUSD"
- "Set up a weekly transfer to savings"

**Predictive Analytics Agent**

- On-chain data analysis
- Volume and liquidity predictions
- Anomaly detection
- Alert generation

### Microtransactions

**Pay-per-API-Call Service**

- Sub-cent payments for API usage
- Payment verification before processing
- Usage tracking and billing
- Rate limiting based on payment

**Machine-to-Machine Payments**

- IoT device micropayments
- Sensor data monetization
- Resource usage billing
- Real-time settlement

# 💰 How We're Judging

See [Judging Criteria](https://www.notion.so/Judging-Criteria-2e298ea5579181e5b31ac78b1ee40bc1?pvs=21).

---

# 💚 Resources & Support

### What You Need

### Check out the [Technical Cheatsheet](https://www.notion.so/Technical-Cheatsheet-2e298ea55791812999dbd2171ed02ca2?pvs=21)

### Getting Help

For technical questions and community support, join us on **Discord** where the Canteen and Tempo team and other builders can help.

---
