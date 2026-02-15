export const runtime = "nodejs";

import { formatUnits } from "viem";
import { NextRequest, NextResponse } from "next/server";

import { ApiError, jsonError } from "@/server/api-error";
import { requireMerchant } from "@/server/auth";
import { prisma } from "@/server/db";
import { readLoanOnchain } from "@/server/chain";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const merchant = await requireMerchant(req);
    const { invoiceId } = await params;

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, merchantId: merchant.id },
    });
    if (!invoice) {
      throw new ApiError(404, "NOT_FOUND", "Invoice not found");
    }

    let status: "created" | "loan_opened" | "paid" = "created";
    let settlementType: "repaid" | "liquidated" | null = null;
    let amountDueOutstanding: string | null = null;

    try {
      const loan = await readLoanOnchain(invoice.correlationId as `0x${string}`);
      const loanLike = loan as {
        state?: unknown;
        settlementType?: unknown;
        amountDueOutstanding?: unknown;
      };

      const state = Number(loanLike.state);
      if (state === 1) status = "loan_opened";
      if (state === 2) {
        status = "paid";
        const st = Number(loanLike.settlementType);
        settlementType = st === 2 ? "liquidated" : st === 1 ? "repaid" : null;
      }

      const due = loanLike.amountDueOutstanding;
      if (typeof due === "bigint") amountDueOutstanding = due.toString();
      else if (typeof due === "number") amountDueOutstanding = BigInt(due).toString();
      else if (typeof due === "string") amountDueOutstanding = due;
    } catch (err) {
      console.warn("onchain read failed, falling back to DB-only:", err);
    }

    return NextResponse.json({
      invoiceId: invoice.id,
      correlationId: invoice.correlationId,
      price: formatUnits(BigInt(invoice.priceBaseUnits), 6),
      dueTimestamp: Number(invoice.dueTimestamp),
      status,
      settlementType,
      amountDueOutstanding,
    });
  } catch (err) {
    return jsonError(err);
  }
}
