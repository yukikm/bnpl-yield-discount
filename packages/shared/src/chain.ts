export const TEMPO_CHAIN_ID = 42431 as const;
export const TEMPO_RPC_URL_DEFAULT = "https://rpc.moderato.tempo.xyz" as const;
export const TEMPO_EXPLORER_URL = "https://explore.tempo.xyz" as const;

export const ALPHA_USD_ADDRESS =
  "0x20c0000000000000000000000000000000000001" as const;
export const PATH_USD_ADDRESS =
  "0x20c0000000000000000000000000000000000000" as const;

export type Hex = `0x${string}`;
export type Address = Hex;

