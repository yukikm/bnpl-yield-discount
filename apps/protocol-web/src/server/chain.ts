import { LoanManagerAbi } from "@bnpl/shared";
import { createPublicClient, http } from "viem";
import { tempoModerato } from "viem/chains";

import { requireEnv } from "./env";

export function getTempoPublicClient() {
  const rpcUrl = process.env.TEMPO_RPC_URL ?? "https://rpc.moderato.tempo.xyz";
  return createPublicClient({
    chain: tempoModerato,
    transport: http(rpcUrl),
  });
}

export async function readLoanOnchain(correlationId: `0x${string}`) {
  const client = getTempoPublicClient();
  const loanManagerAddress = requireEnv("LOAN_MANAGER_ADDRESS") as `0x${string}`;

  return client.readContract({
    address: loanManagerAddress,
    abi: LoanManagerAbi,
    functionName: "getLoan",
    args: [correlationId],
  });
}
