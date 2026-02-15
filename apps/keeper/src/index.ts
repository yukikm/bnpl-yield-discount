import { Command } from "commander";
import {
  ALPHA_USD_ADDRESS,
  PATH_USD_ADDRESS,
  LendingPoolAbi,
  LoanManagerAbi,
} from "@bnpl/shared";
import {
  createClient,
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { tempoModerato } from "viem/chains";
import { Actions, Addresses, Tick, tempoActions } from "viem/tempo";

const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const MAX_UINT256 = (1n << 256n) - 1n;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function isBytes32Hex(v: string): v is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(v);
}

function getConfig() {
  const rpcUrl = process.env.TEMPO_RPC_URL ?? "https://rpc.moderato.tempo.xyz";
  const alphaUsdAddress = (process.env.ALPHA_USD_ADDRESS ??
    ALPHA_USD_ADDRESS) as `0x${string}`;
  const pathUsdAddress = (process.env.PATH_USD_ADDRESS ??
    PATH_USD_ADDRESS) as `0x${string}`;

  const chain = tempoModerato.extend({ feeToken: alphaUsdAddress });

  return { rpcUrl, alphaUsdAddress, pathUsdAddress, chain };
}

function getClients() {
  const { rpcUrl, alphaUsdAddress, pathUsdAddress, chain } = getConfig();
  const privateKey = requireEnv("KEEPER_PRIVATE_KEY") as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });

  // Tempo-native actions (DEX, faucet, etc.)
  const tempoClient = createClient({
    account,
    chain,
    transport: http(rpcUrl),
  }).extend(tempoActions());

  return {
    account,
    chain,
    publicClient,
    walletClient,
    tempoClient,
    alphaUsdAddress,
    pathUsdAddress,
  };
}

async function waitAndLog(publicClient: any, hash: `0x${string}`) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  // eslint-disable-next-line no-console
  console.log({ txHash: receipt.transactionHash, status: receipt.status });
  return receipt;
}

const program = new Command();
program.name("keeper").description("YieldDiscount BNPL Keeper (Tempo)");

program
  .command("start")
  .description("Start a minimal long-running process (MVP placeholder).")
  .action(() => {
    // eslint-disable-next-line no-console
    console.log("keeper:start");
    // Keep alive
    setInterval(() => {
      // eslint-disable-next-line no-console
      console.log("keeper:tick", new Date().toISOString());
    }, 60_000);
  });

program
  .command("faucet")
  .description(
    "Fund an address on Tempo testnet via JSON-RPC (tempo_fundAddress).",
  )
  .option("--address <address>", "address to fund (default: keeper account)")
  .option("--timeout <ms>", "receipt wait timeout (default 10000)", "10000")
  .action(async (opts: { address?: string; timeout: string }) => {
    const { tempoClient, account } = getClients();
    const address = (opts.address ?? account.address) as `0x${string}`;
    const timeout = Number(opts.timeout);

    const receipts: any = await Actions.faucet.fundSync(tempoClient as any, {
      account: address,
      timeout: Number.isFinite(timeout) ? timeout : 10_000,
    });

    // eslint-disable-next-line no-console
    console.log({
      funded: address,
      txs: receipts.map((r: any) => ({
        txHash: r.transactionHash,
        status: r.status,
      })),
    });
  });

program
  .command("approve")
  .description("Approve a spender to spend token (TIP-20 / ERC-20).")
  .requiredOption("--spender <address>", "spender address")
  .option("--token <address>", "token address (default AlphaUSD)")
  .option("--amount <amount>", "amount (decimals=6) or 'max'", "max")
  .action(async (opts: { spender: string; token?: string; amount: string }) => {
    const { publicClient, walletClient, alphaUsdAddress } = getClients();
    const token = (opts.token ?? alphaUsdAddress) as `0x${string}`;
    const spender = opts.spender as `0x${string}`;

    const amount =
      opts.amount === "max" ? MAX_UINT256 : parseUnits(opts.amount, 6);

    // eslint-disable-next-line no-console
    console.log("approve", { token, spender, amount: amount.toString() });

    const hash = await walletClient.writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
    });

    await waitAndLog(publicClient, hash);
  });

program
  .command("delegate")
  .description("Call LoanManager.delegateInvestableToStrategy (onlyOperator).")
  .requiredOption("--loanId <bytes32>", "loanId (= correlationId bytes32)")
  .action(async (opts: { loanId: string }) => {
    if (!isBytes32Hex(opts.loanId)) throw new Error("Invalid loanId bytes32");

    const { publicClient, walletClient } = getClients();
    const loanManagerAddress = requireEnv("LOAN_MANAGER_ADDRESS") as `0x${string}`;

    const hash = await walletClient.writeContract({
      address: loanManagerAddress,
      abi: LoanManagerAbi,
      functionName: "delegateInvestableToStrategy",
      args: [opts.loanId as `0x${string}`],
    });

    await waitAndLog(publicClient, hash);
  });

program
  .command("pool-deposit")
  .description("Deposit AlphaUSD into LendingPool (share mint).")
  .requiredOption("--amount <amount>", "assets (AlphaUSD, decimals=6)")
  .action(async (opts: { amount: string }) => {
    const { publicClient, walletClient } = getClients();
    const poolAddress = requireEnv("LENDING_POOL_ADDRESS") as `0x${string}`;
    const amount = parseUnits(opts.amount, 6);

    // eslint-disable-next-line no-console
    console.log("pool-deposit", { poolAddress, amount: amount.toString() });

    const hash = await walletClient.writeContract({
      address: poolAddress,
      abi: LendingPoolAbi,
      functionName: "deposit",
      args: [amount],
    });

    await waitAndLog(publicClient, hash);
  });

program
  .command("harvest")
  .description("Call LoanManager.harvestProfit (onlyOperator).")
  .requiredOption("--amount <amount>", "profitAmount (AlphaUSD, decimals=6)")
  .action(async (opts: { amount: string }) => {
    const { publicClient, walletClient } = getClients();
    const loanManagerAddress = requireEnv("LOAN_MANAGER_ADDRESS") as `0x${string}`;
    const amount = parseUnits(opts.amount, 6);

    // eslint-disable-next-line no-console
    console.log("harvest", { amount: amount.toString() });

    const hash = await walletClient.writeContract({
      address: loanManagerAddress,
      abi: LoanManagerAbi,
      functionName: "harvestProfit",
      args: [amount],
    });

    await waitAndLog(publicClient, hash);
  });

program
  .command("return-principal")
  .description("Call LoanManager.returnStrategyPrincipal (onlyOperator).")
  .requiredOption("--loanId <bytes32>", "loanId (= correlationId bytes32)")
  .requiredOption("--amount <amount>", "amount (AlphaUSD, decimals=6)")
  .action(async (opts: { loanId: string; amount: string }) => {
    if (!isBytes32Hex(opts.loanId)) throw new Error("Invalid loanId bytes32");

    const { publicClient, walletClient } = getClients();
    const loanManagerAddress = requireEnv("LOAN_MANAGER_ADDRESS") as `0x${string}`;
    const amount = parseUnits(opts.amount, 6);

    const hash = await walletClient.writeContract({
      address: loanManagerAddress,
      abi: LoanManagerAbi,
      functionName: "returnStrategyPrincipal",
      args: [opts.loanId as `0x${string}`, amount],
    });

    await waitAndLog(publicClient, hash);
  });

program
  .command("liquidate")
  .description("Call LoanManager.liquidate (onlyOperator).")
  .requiredOption("--loanId <bytes32>", "loanId (= correlationId bytes32)")
  .action(async (opts: { loanId: string }) => {
    if (!isBytes32Hex(opts.loanId)) throw new Error("Invalid loanId bytes32");

    const { publicClient, walletClient } = getClients();
    const loanManagerAddress = requireEnv("LOAN_MANAGER_ADDRESS") as `0x${string}`;

    const hash = await walletClient.writeContract({
      address: loanManagerAddress,
      abi: LoanManagerAbi,
      functionName: "liquidate",
      args: [opts.loanId as `0x${string}`],
    });

    await waitAndLog(publicClient, hash);
  });

program
  .command("place-flip")
  .description("Place a DEX flip order (market making).")
  .requiredOption("--amount <amount>", "amount (AlphaUSD, decimals=6)")
  .option("--tick <price>", "tick price", "0.999")
  .option("--flipTick <price>", "flip tick price", "1.001")
  .option("--type <buy|sell>", "order type", "buy")
  .action(
    async (opts: {
      amount: string;
      tick: string;
      flipTick: string;
      type: "buy" | "sell";
    }) => {
      const { tempoClient, alphaUsdAddress, account, chain } = getClients();
      const amount = parseUnits(opts.amount, 6);

      const result: any = await Actions.dex.placeFlipSync(tempoClient as any, {
        account,
        chain,
        token: alphaUsdAddress,
        amount,
        type: opts.type,
        tick: Tick.fromPrice(opts.tick),
        flipTick: Tick.fromPrice(opts.flipTick),
      });

      // eslint-disable-next-line no-console
      console.log({
        orderId: result.orderId?.toString?.() ?? String(result.orderId),
        txHash: result.receipt?.transactionHash ?? null,
        tick: result.tick?.toString?.() ?? String(result.tick),
        flipTick: result.flipTick?.toString?.() ?? String(result.flipTick),
      });
    },
  );

program
  .command("cancel-order")
  .description("Cancel an order by orderId.")
  .requiredOption("--orderId <id>", "orderId (bigint)")
  .action(async (opts: { orderId: string }) => {
    const { tempoClient, account, chain } = getClients();
    const orderId = BigInt(opts.orderId);

    const result: any = await Actions.dex.cancelSync(tempoClient as any, {
      account,
      chain,
      orderId,
    });

    // eslint-disable-next-line no-console
    console.log({
      orderId: result.orderId?.toString?.() ?? String(orderId),
      txHash: result.receipt?.transactionHash ?? null,
    });
  });

program
  .command("unwind")
  .description("Cancel a flip order and swap any pathUSD back to AlphaUSD.")
  .requiredOption("--orderId <id>", "orderId (bigint)")
  .option("--swap", "swap tokenIn -> tokenOut after cancelling", true)
  .option("--minOutBps <bps>", "minAmountOut in bps (default 9900)", "9900")
  .option("--tokenIn <address>", "tokenIn (default pathUSD)")
  .option("--tokenOut <address>", "tokenOut (default AlphaUSD)")
  .action(
    async (opts: {
      orderId: string;
      swap: boolean;
      minOutBps: string;
      tokenIn?: string;
      tokenOut?: string;
    }) => {
      const {
        account,
        chain,
        publicClient,
        tempoClient,
        alphaUsdAddress,
        pathUsdAddress,
      } = getClients();

      const orderId = BigInt(opts.orderId);
      const tokenIn = (opts.tokenIn ?? pathUsdAddress) as `0x${string}`;
      const tokenOut = (opts.tokenOut ?? alphaUsdAddress) as `0x${string}`;
      const minOutBps = BigInt(opts.minOutBps);

      // 1) Cancel order
      const cancelled: any = await Actions.dex.cancelSync(tempoClient as any, {
        account,
        chain,
        orderId,
      });
      // eslint-disable-next-line no-console
      console.log({
        step: "cancel",
        orderId: cancelled.orderId?.toString?.() ?? String(orderId),
        txHash: cancelled.receipt?.transactionHash ?? null,
      });

      if (!opts.swap) return;

      // 2) Swap tokenIn -> tokenOut (sell exact amount in)
      const balance = (await publicClient.readContract({
        address: tokenIn,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      })) as bigint;

      // eslint-disable-next-line no-console
      console.log({
        step: "balance",
        tokenIn,
        balance: balance.toString(),
        balanceFormatted: formatUnits(balance, 6),
      });

      if (balance === 0n) return;

      const minAmountOut = (balance * minOutBps) / 10_000n;
      const sold: any = await Actions.dex.sellSync(tempoClient as any, {
        account,
        chain,
        tokenIn,
        tokenOut,
        amountIn: balance,
        minAmountOut,
      });

      // eslint-disable-next-line no-console
      console.log({
        step: "swap",
        tokenIn,
        tokenOut,
        amountIn: balance.toString(),
        minAmountOut: minAmountOut.toString(),
        txHash: sold.receipt?.transactionHash ?? null,
      });
    },
  );

program
  .command("dex-addresses")
  .description("Print Tempo DEX-related system addresses.")
  .action(() => {
    // eslint-disable-next-line no-console
    console.log({
      stablecoinDex: Addresses.stablecoinDex,
    });
  });

program.parseAsync().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
