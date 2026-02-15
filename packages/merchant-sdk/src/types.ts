export type CreateInvoiceInput = {
  price: string;
  dueTimestamp: number;
  description?: string;
  idempotencyKey: string;
};

export type CreateInvoiceResponse = {
  invoiceId: string;
  correlationId: `0x${string}`;
  checkoutUrl: string;
  merchantFee: string;
  merchantPayout: string;
  dueTimestamp: number;
};

export type InvoiceStatusResponse = {
  invoiceId: string;
  correlationId: `0x${string}`;
  price: string;
  dueTimestamp: number;
  status: "created" | "loan_opened" | "paid";
  settlementType: "repaid" | "liquidated" | null;
  amountDueOutstanding: string | null;
};

