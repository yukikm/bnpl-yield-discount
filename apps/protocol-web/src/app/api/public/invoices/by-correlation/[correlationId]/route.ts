export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";

import { ApiError, jsonError } from "@/server/api-error";
import { prisma } from "@/server/db";

function isBytes32Hex(v: string): v is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(v);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ correlationId: string }> },
) {
  try {
    const { correlationId } = await params;
    if (!isBytes32Hex(correlationId)) {
      throw new ApiError(400, "BAD_REQUEST", "Invalid correlationId (bytes32 hex)");
    }

    const invoice = await prisma.invoice.findFirst({
      where: { correlationId },
      include: { merchant: true },
    });
    if (!invoice) {
      throw new ApiError(404, "NOT_FOUND", "Invoice not found");
    }

    return NextResponse.json({
      invoiceId: invoice.id,
      correlationId: invoice.correlationId,
      invoiceData: {
        correlationId: invoice.correlationId,
        merchant: invoice.merchant.walletAddress,
        price: invoice.priceBaseUnits,
        dueTimestamp: invoice.dueTimestamp.toString(),
      },
      signature: invoice.signature,
    });
  } catch (err) {
    return jsonError(err);
  }
}

