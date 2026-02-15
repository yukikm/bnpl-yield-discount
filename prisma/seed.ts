import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function main() {
  const prisma = new PrismaClient();

  const apiKey = process.env.DEMO_MERCHANT_API_KEY;
  if (!apiKey) {
    throw new Error("Missing env: DEMO_MERCHANT_API_KEY");
  }

  const walletAddress =
    process.env.DEMO_MERCHANT_WALLET_ADDRESS ??
    // Tempo community wallet (from hackathon cheatsheet). Override via env for real demos.
    "0x031891A61200FedDd622EbACC10734BC90093B2A";

  const existing = await prisma.merchant.findFirst({
    where: { name: "Demo Merchant" },
  });

  const merchant = existing
    ? await prisma.merchant.update({
        where: { id: existing.id },
        data: { walletAddress, apiKeyHash: sha256Hex(apiKey) },
      })
    : await prisma.merchant.create({
        data: {
          name: "Demo Merchant",
          walletAddress,
          apiKeyHash: sha256Hex(apiKey),
        },
      });

  console.log("Seeded merchant:");
  console.log({ merchantId: merchant.id, walletAddress: merchant.walletAddress });

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
