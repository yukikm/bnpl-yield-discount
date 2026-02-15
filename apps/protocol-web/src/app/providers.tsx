"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { ALPHA_USD_ADDRESS } from "@bnpl/shared";
import { tempoModerato } from "viem/chains";

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Missing env: <code>NEXT_PUBLIC_PRIVY_APP_ID</code>
        </div>
        <div className="mt-6">{children}</div>
      </div>
    );
  }

  const chain = tempoModerato.extend({ feeToken: ALPHA_USD_ADDRESS });

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "light",
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
