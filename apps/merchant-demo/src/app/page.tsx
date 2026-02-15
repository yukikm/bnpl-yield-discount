import { createMerchantClient } from "@bnpl/merchant-sdk";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

async function buyAction() {
  "use server";

  const baseUrl = process.env.PROTOCOL_API_BASE_URL;
  const apiKey = process.env.DEMO_MERCHANT_API_KEY;
  if (!baseUrl) throw new Error("Missing env: PROTOCOL_API_BASE_URL");
  if (!apiKey) throw new Error("Missing env: DEMO_MERCHANT_API_KEY");

  const client = createMerchantClient({ baseUrl, apiKey });

  const dueTimestamp = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60;
  const idempotencyKey = randomUUID();

  const invoice = await client.createInvoice({
    price: "1000",
    dueTimestamp,
    description: "Demo item (YieldDiscount BNPL)",
    idempotencyKey,
  });

  redirect(invoice.checkoutUrl);
}

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Merchant Demo</h1>
      <p className="mt-2 text-sm text-neutral-600">
        Click purchase to create an invoice via Merchant API and redirect to the
        Protocol Checkout.
      </p>

      <div className="mt-6 rounded-xl border bg-white p-4">
        <div className="text-sm text-neutral-600">Product</div>
        <div className="mt-1 text-lg font-semibold">Demo Item</div>
        <div className="mt-2 text-sm">
          Price: <span className="font-medium">1000 AlphaUSD</span>
        </div>

        <form action={buyAction} className="mt-4">
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm text-white hover:bg-neutral-800"
          >
            Purchase with BNPL
          </button>
        </form>
      </div>
    </main>
  );
}
