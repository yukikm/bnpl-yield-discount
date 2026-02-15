import type { Address, Hex } from "./chain";

export type InvoiceTypedData = {
  correlationId: Hex; // bytes32
  merchant: Address;
  price: bigint; // AlphaUSD base units (decimals=6)
  dueTimestamp: bigint; // unix seconds
};

export function buildInvoiceEip712({
  chainId,
  verifyingContract,
}: {
  chainId: number;
  verifyingContract: Address;
}) {
  return {
    domain: {
      name: "YieldDiscountBNPL",
      version: "1",
      chainId,
      verifyingContract,
    },
    types: {
      InvoiceData: [
        { name: "correlationId", type: "bytes32" },
        { name: "merchant", type: "address" },
        { name: "price", type: "uint256" },
        { name: "dueTimestamp", type: "uint64" },
      ],
    },
    primaryType: "InvoiceData" as const,
  };
}

