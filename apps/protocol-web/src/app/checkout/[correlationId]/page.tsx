import { ALPHA_USD_ADDRESS, PATH_USD_ADDRESS } from "@bnpl/shared";

import { CheckoutClient } from "./ui";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ correlationId: string }>;
}) {
  const { correlationId } = await params;

  const loanManagerAddress = process.env.LOAN_MANAGER_ADDRESS as
    | `0x${string}`
    | undefined;
  const alphaUsdAddress = (process.env.ALPHA_USD_ADDRESS as
    | `0x${string}`
    | undefined) || ALPHA_USD_ADDRESS;
  const pathUsdAddress = (process.env.PATH_USD_ADDRESS as
    | `0x${string}`
    | undefined) || PATH_USD_ADDRESS;

  if (!loanManagerAddress) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Checkout</h1>
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Missing env: <code>LOAN_MANAGER_ADDRESS</code>
        </div>
      </main>
    );
  }

  return (
    <CheckoutClient
      correlationId={correlationId}
      loanManagerAddress={loanManagerAddress}
      alphaUsdAddress={alphaUsdAddress}
      pathUsdAddress={pathUsdAddress}
    />
  );
}
