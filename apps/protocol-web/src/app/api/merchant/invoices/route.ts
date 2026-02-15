export const runtime = "nodejs";

import { BPS_DENOM, MERCHANT_FEE_BPS, buildInvoiceEip712 } from "@bnpl/shared";
import { NextRequest, NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import { formatUnits, parseUnits } from "viem";
import { z } from "zod";

import { ApiError, jsonError } from "@/server/api-error";
import { requireMerchant } from "@/server/auth";
import { randomBytes32Hex, sha256Hex } from "@/server/crypto";
import { prisma } from "@/server/db";
import { requireEnv } from "@/server/env";

const BodySchema = z.object({
  price: z.string().min(1),
  dueTimestamp: z.number().int().positive(),
  description: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const merchant = await requireMerchant(req);

    const idempotencyKey = req.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey) {
      throw new ApiError(400, "BAD_REQUEST", "Missing Idempotency-Key header");
    }

    const body = BodySchema.parse(await req.json());

    const now = Math.floor(Date.now() / 1000);
    if (body.dueTimestamp <= now) {
      throw new ApiError(400, "BAD_REQUEST", "dueTimestamp must be in the future");
    }

    let priceBaseUnits: bigint;
    try {
      priceBaseUnits = parseUnits(body.price, 6);
    } catch {
      throw new ApiError(400, "BAD_REQUEST", "Invalid price format (decimals=6)");
    }
    if (priceBaseUnits <= 0n) {
      throw new ApiError(400, "BAD_REQUEST", "price must be > 0");
    }

    const requestHash = sha256Hex(
      JSON.stringify({
        price: body.price,
        dueTimestamp: body.dueTimestamp,
        description: body.description ?? null,
      }),
    );

    const invoice = await prisma.$transaction(async (tx) => {
      const existing = await tx.idempotencyKey.findUnique({
        where: {
          merchantId_key: { merchantId: merchant.id, key: idempotencyKey },
        },
        include: { invoice: true },
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ApiError(409, "CONFLICT", "Idempotency-Key conflict");
        }
        return existing.invoice;
      }

      const correlationId = randomBytes32Hex();

      const invoiceSignerPk = requireEnv("INVOICE_SIGNER_PRIVATE_KEY") as `0x${string}`;
      const loanManagerAddress = requireEnv("LOAN_MANAGER_ADDRESS") as `0x${string}`;
      const chainId = Number(process.env.TEMPO_CHAIN_ID || 42431);

      const account = privateKeyToAccount(invoiceSignerPk);
      const eip712 = buildInvoiceEip712({
        chainId,
        verifyingContract: loanManagerAddress,
      });

      const signature = await account.signTypedData({
        domain: eip712.domain,
        types: eip712.types,
        primaryType: eip712.primaryType,
        message: {
          correlationId,
          merchant: merchant.walletAddress as `0x${string}`,
          price: priceBaseUnits,
          dueTimestamp: BigInt(body.dueTimestamp),
        },
      });

      const merchantFee = (priceBaseUnits * BigInt(MERCHANT_FEE_BPS)) / BigInt(BPS_DENOM);
      const merchantPayout = priceBaseUnits - merchantFee;

      const created = await tx.invoice.create({
        data: {
          merchantId: merchant.id,
          correlationId,
          priceBaseUnits: priceBaseUnits.toString(),
          dueTimestamp: BigInt(body.dueTimestamp),
          description: body.description,
          signature,
          merchantFeeBaseUnits: merchantFee.toString(),
          merchantPayoutBaseUnits: merchantPayout.toString(),
        },
      });

      await tx.idempotencyKey.create({
        data: {
          merchantId: merchant.id,
          key: idempotencyKey,
          requestHash,
          invoiceId: created.id,
        },
      });

      return created;
    });

    const checkoutBaseUrl = requireEnv("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
    const checkoutUrl = `${checkoutBaseUrl}/checkout/${invoice.correlationId}`;

    return NextResponse.json({
      invoiceId: invoice.id,
      correlationId: invoice.correlationId,
      checkoutUrl,
      merchantFee: formatUnits(BigInt(invoice.merchantFeeBaseUnits), 6),
      merchantPayout: formatUnits(BigInt(invoice.merchantPayoutBaseUnits), 6),
      dueTimestamp: Number(invoice.dueTimestamp),
    });
  } catch (err) {
    return jsonError(err);
  }
}
