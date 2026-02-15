"use client";

import { LoanManagerAbi } from "@bnpl/shared";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  parseUnits,
} from "viem";
import { tempoModerato } from "viem/chains";

const TIP20_ABI = [
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

type PublicClientLike = {
  readContract: (args: unknown) => Promise<unknown>;
  waitForTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<unknown>;
};

type WalletClientLike = {
  writeContract: (args: unknown) => Promise<`0x${string}`>;
};

type PublicInvoiceResponse = {
  invoiceId: string;
  correlationId: `0x${string}`;
  invoiceData: {
    correlationId: `0x${string}`;
    merchant: `0x${string}`;
    price: string; // base units
    dueTimestamp: string; // unix seconds
  };
  signature: `0x${string}`;
};

export function CheckoutClient(props: {
  correlationId: string;
  loanManagerAddress: `0x${string}`;
  alphaUsdAddress: `0x${string}`;
  pathUsdAddress: `0x${string}`;
}) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();

  const wallet = wallets[0];

  const [invoice, setInvoice] = useState<PublicInvoiceResponse | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  const [collateralDeposit, setCollateralDeposit] = useState("1600");
  const [repayTargetAmount, setRepayTargetAmount] = useState("1000");

  const [alphaBalance, setAlphaBalance] = useState<bigint | null>(null);
  const [pendingProfit, setPendingProfit] = useState<bigint | null>(null);
  const [loanState, setLoanState] = useState<number | null>(null);
  const [amountDueOutstanding, setAmountDueOutstanding] = useState<bigint | null>(
    null,
  );

  const [txOpen, setTxOpen] = useState<`0x${string}` | null>(null);
  const [txRepay, setTxRepay] = useState<`0x${string}` | null>(null);
  const [txApprove, setTxApprove] = useState<`0x${string}` | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const priceBaseUnits = useMemo(() => {
    if (!invoice) return null;
    try {
      return BigInt(invoice.invoiceData.price);
    } catch {
      return null;
    }
  }, [invoice]);

  const collateralBaseUnits = useMemo(() => {
    try {
      return parseUnits(collateralDeposit || "0", 6);
    } catch {
      return null;
    }
  }, [collateralDeposit]);

  const reservedCollateral = useMemo(() => {
    if (!priceBaseUnits) return null;
    return (priceBaseUnits * 12_500n) / 10_000n;
  }, [priceBaseUnits]);

  const investableCollateral = useMemo(() => {
    if (!reservedCollateral || collateralBaseUnits === null) return null;
    const available =
      collateralBaseUnits > reservedCollateral
        ? collateralBaseUnits - reservedCollateral
        : 0n;
    const limit = (collateralBaseUnits * 5_000n) / 10_000n;
    return available < limit ? available : limit;
  }, [collateralBaseUnits, reservedCollateral]);

  useEffect(() => {
    let cancelled = false;
    setInvoice(null);
    setInvoiceError(null);

    void (async () => {
      const res = await fetch(
        `/api/public/invoices/by-correlation/${props.correlationId}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok) {
        const msg = json?.error?.message ?? "Failed to load invoice";
        if (!cancelled) setInvoiceError(String(msg));
        return;
      }
      if (!cancelled) setInvoice(json as PublicInvoiceResponse);
    })();

    return () => {
      cancelled = true;
    };
  }, [props.correlationId]);

  async function withClients<T>(fn: (args: {
    publicClient: PublicClientLike;
    walletClient: WalletClientLike;
    address: `0x${string}`;
  }) => Promise<T>) {
    if (!wallet) throw new Error("No wallet connected");
    const provider = await wallet.getEthereumProvider();
    const address = wallet.address as `0x${string}`;
    const chain = tempoModerato.extend({ feeToken: props.alphaUsdAddress });

    const publicClient = createPublicClient({
      chain,
      transport: custom(provider),
    }) as unknown as PublicClientLike;
    const walletClient = createWalletClient({
      account: address,
      chain,
      transport: custom(provider),
    }) as unknown as WalletClientLike;

    return fn({ publicClient, walletClient, address });
  }

  async function refresh() {
    if (!wallet || !invoice) return;

    await withClients(async ({ publicClient, address }) => {
      const [bal, loan, pp] = await Promise.all([
        publicClient.readContract({
          address: props.alphaUsdAddress,
          abi: TIP20_ABI,
          functionName: "balanceOf",
          args: [address],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: props.loanManagerAddress,
          abi: LoanManagerAbi,
          functionName: "getLoan",
          args: [invoice.correlationId],
        }),
        publicClient.readContract({
          address: props.loanManagerAddress,
          abi: LoanManagerAbi,
          functionName: "pendingProfit",
          args: [invoice.correlationId],
        }) as Promise<bigint>,
      ]);

      setAlphaBalance(bal);
      setPendingProfit(pp);
      const loanLike = loan as { state?: unknown; amountDueOutstanding?: unknown };
      setLoanState(Number(loanLike.state));
      setAmountDueOutstanding(
        typeof loanLike.amountDueOutstanding === "bigint" ? loanLike.amountDueOutstanding : null,
      );
    });
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address, invoice?.correlationId]);

  async function approveMax() {
    if (!wallet) return;
    setBusy("approve");
    setTxApprove(null);
    try {
      await withClients(async ({ publicClient, walletClient }) => {
        const hash = await walletClient.writeContract({
          address: props.alphaUsdAddress,
          abi: TIP20_ABI,
          functionName: "approve",
          args: [props.loanManagerAddress, MAX_UINT256],
        });
        setTxApprove(hash);
        await publicClient.waitForTransactionReceipt({ hash });
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function openLoan() {
    if (!invoice) return;
    if (!wallet) return;
    if (collateralBaseUnits === null) return;
    setBusy("openLoan");
    setTxOpen(null);
    try {
      await withClients(async ({ publicClient, walletClient }) => {
        const hash = await walletClient.writeContract({
          address: props.loanManagerAddress,
          abi: LoanManagerAbi,
          functionName: "openLoan",
          args: [
            {
              correlationId: invoice.correlationId,
              merchant: invoice.invoiceData.merchant,
              price: BigInt(invoice.invoiceData.price),
              dueTimestamp: BigInt(invoice.invoiceData.dueTimestamp),
            },
            invoice.signature,
            collateralBaseUnits,
          ],
        });
        setTxOpen(hash);
        await publicClient.waitForTransactionReceipt({ hash });
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function repay() {
    if (!invoice) return;
    if (!wallet) return;

    let repayBaseUnits: bigint;
    try {
      repayBaseUnits = parseUnits(repayTargetAmount || "0", 6);
    } catch {
      return;
    }
    if (repayBaseUnits <= 0n) return;

    setBusy("repay");
    setTxRepay(null);
    try {
      await withClients(async ({ publicClient, walletClient }) => {
        const hash = await walletClient.writeContract({
          address: props.loanManagerAddress,
          abi: LoanManagerAbi,
          functionName: "repay",
          args: [invoice.correlationId, repayBaseUnits],
        });
        setTxRepay(hash);
        await publicClient.waitForTransactionReceipt({ hash });
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const statusLabel = (() => {
    if (loanState === null) return "unknown";
    if (loanState === 0) return "created";
    if (loanState === 1) return "loan_opened";
    if (loanState === 2) return "paid";
    return `state=${loanState}`;
  })();

  const repayPreview = useMemo(() => {
    if (!pendingProfit) return null;
    let repayBaseUnits: bigint;
    try {
      repayBaseUnits = parseUnits(repayTargetAmount || "0", 6);
    } catch {
      return null;
    }
    if (repayBaseUnits <= 0n) return null;
    const discountApplied = pendingProfit < repayBaseUnits ? pendingProfit : repayBaseUnits;
    const borrowerPayAmount = repayBaseUnits - discountApplied;
    return { discountApplied, borrowerPayAmount, repayBaseUnits };
  }, [pendingProfit, repayTargetAmount]);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Checkout</h1>
          <p className="mt-1 text-sm text-neutral-600">
            correlationId:{" "}
            <code className="rounded bg-neutral-100 px-1 py-0.5">
              {props.correlationId}
            </code>
          </p>
        </div>
        <button
          className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
          onClick={() => void refresh()}
          disabled={!wallet || !invoice}
        >
          Refresh
        </button>
      </div>

      {invoiceError ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {invoiceError}
        </div>
      ) : null}

      {invoice ? (
        <div className="mt-6 rounded-xl border bg-white p-4">
          <div className="text-sm text-neutral-600">Invoice</div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div className="text-neutral-600">Price</div>
            <div className="font-medium">
              {formatUnits(BigInt(invoice.invoiceData.price), 6)} AlphaUSD
            </div>
            <div className="text-neutral-600">Due</div>
            <div className="font-medium">
              {new Date(Number(invoice.invoiceData.dueTimestamp) * 1000).toUTCString()}
            </div>
            <div className="text-neutral-600">Merchant</div>
            <div className="font-mono text-xs">{invoice.invoiceData.merchant}</div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-neutral-600">Wallet</div>
            <div className="mt-1 text-sm font-medium">
              {authenticated && wallet ? wallet.address : "Not connected"}
            </div>
          </div>
          {ready ? (
            authenticated ? (
              <button
                className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
                onClick={() => void logout()}
              >
                Logout
              </button>
            ) : (
              <button
                className="rounded-md bg-black px-3 py-2 text-sm text-white hover:bg-neutral-800"
                onClick={() => void login()}
              >
                Login
              </button>
            )
          ) : (
            <button className="rounded-md border px-3 py-2 text-sm" disabled>
              Loading...
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="text-neutral-600">AlphaUSD balance</div>
          <div className="font-medium">
            {alphaBalance === null ? "-" : `${formatUnits(alphaBalance, 6)} AlphaUSD`}
          </div>
          <div className="text-neutral-600">Loan status</div>
          <div className="font-medium">{statusLabel}</div>
          <div className="text-neutral-600">Outstanding</div>
          <div className="font-medium">
            {amountDueOutstanding === null
              ? "-"
              : `${formatUnits(amountDueOutstanding, 6)} AlphaUSD`}
          </div>
          <div className="text-neutral-600">Pending profit (discount)</div>
          <div className="font-medium">
            {pendingProfit === null ? "-" : `${formatUnits(pendingProfit, 6)} AlphaUSD`}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-white p-4">
        <div className="text-sm font-medium">1) Approve (AlphaUSD)</div>
        <p className="mt-1 text-sm text-neutral-600">
          Approve LoanManager to spend AlphaUSD for collateral + repay.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            className="rounded-md bg-black px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            onClick={() => void approveMax()}
            disabled={!authenticated || !wallet || busy !== null}
          >
            {busy === "approve" ? "Approving..." : "Approve Max"}
          </button>
          {txApprove ? (
            <div className="text-xs text-neutral-600">
              tx: <code className="rounded bg-neutral-100 px-1">{txApprove}</code>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-white p-4">
        <div className="text-sm font-medium">2) Deposit Collateral + openLoan</div>
        <div className="mt-3 grid grid-cols-2 items-center gap-3 text-sm">
          <label className="text-neutral-600" htmlFor="collateral">
            collateralDeposit (AlphaUSD)
          </label>
          <input
            id="collateral"
            className="rounded-md border px-3 py-2"
            value={collateralDeposit}
            onChange={(e) => setCollateralDeposit(e.target.value)}
            inputMode="decimal"
          />
          <div className="text-neutral-600">reservedCollateral</div>
          <div className="font-medium">
            {reservedCollateral === null ? "-" : formatUnits(reservedCollateral, 6)}
          </div>
          <div className="text-neutral-600">investableCollateral</div>
          <div className="font-medium">
            {investableCollateral === null ? "-" : formatUnits(investableCollateral, 6)}
          </div>
        </div>

        {reservedCollateral !== null &&
        collateralBaseUnits !== null &&
        collateralBaseUnits < reservedCollateral ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Collateral is insufficient. Need at least{" "}
            <span className="font-medium">{formatUnits(reservedCollateral, 6)}</span>{" "}
            AlphaUSD.
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-md bg-black px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            onClick={() => void openLoan()}
            disabled={
              !authenticated ||
              !wallet ||
              !invoice ||
              collateralBaseUnits === null ||
              busy !== null
            }
          >
            {busy === "openLoan" ? "Opening..." : "openLoan"}
          </button>
          {txOpen ? (
            <div className="text-xs text-neutral-600">
              tx: <code className="rounded bg-neutral-100 px-1">{txOpen}</code>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-white p-4">
        <div className="text-sm font-medium">3) Repay</div>
        <div className="mt-3 grid grid-cols-2 items-center gap-3 text-sm">
          <label className="text-neutral-600" htmlFor="repay">
            repayTargetAmount (AlphaUSD)
          </label>
          <input
            id="repay"
            className="rounded-md border px-3 py-2"
            value={repayTargetAmount}
            onChange={(e) => setRepayTargetAmount(e.target.value)}
            inputMode="decimal"
          />
          <div className="text-neutral-600">discountApplied</div>
          <div className="font-medium">
            {repayPreview ? formatUnits(repayPreview.discountApplied, 6) : "-"}
          </div>
          <div className="text-neutral-600">borrowerPayAmount</div>
          <div className="font-medium">
            {repayPreview ? formatUnits(repayPreview.borrowerPayAmount, 6) : "-"}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded-md bg-black px-3 py-2 text-sm text-white hover:bg-neutral-800 disabled:opacity-50"
            onClick={() => void repay()}
            disabled={!authenticated || !wallet || !invoice || busy !== null}
          >
            {busy === "repay" ? "Repaying..." : "repay"}
          </button>
          {txRepay ? (
            <div className="text-xs text-neutral-600">
              tx: <code className="rounded bg-neutral-100 px-1">{txRepay}</code>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6 rounded-xl border bg-neutral-50 p-4 text-sm text-neutral-700">
        <div className="font-medium">Addresses</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div className="text-neutral-600">LoanManager</div>
          <div className="font-mono">{props.loanManagerAddress}</div>
          <div className="text-neutral-600">AlphaUSD</div>
          <div className="font-mono">{props.alphaUsdAddress}</div>
          <div className="text-neutral-600">pathUSD</div>
          <div className="font-mono">{props.pathUsdAddress}</div>
        </div>
      </div>
    </main>
  );
}
