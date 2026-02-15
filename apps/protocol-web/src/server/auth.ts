import type { Merchant } from "@prisma/client";
import type { NextRequest } from "next/server";

import { ApiError } from "./api-error";
import { sha256Hex } from "./crypto";
import { prisma } from "./db";

export async function requireMerchant(req: NextRequest): Promise<Merchant> {
  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\\s+(.+)$/i);
  const apiKey = match?.[1]?.trim();

  if (!apiKey) {
    throw new ApiError(401, "UNAUTHORIZED", "Missing Authorization header");
  }

  const apiKeyHash = sha256Hex(apiKey);
  const merchant = await prisma.merchant.findFirst({ where: { apiKeyHash } });

  if (!merchant) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid API key");
  }

  return merchant;
}

