import "server-only";

import type {
  CreateInvoiceInput,
  CreateInvoiceResponse,
  InvoiceStatusResponse,
} from "./types";

export type MerchantSdkClient = {
  createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResponse>;
  getInvoiceByInvoiceId(invoiceId: string): Promise<InvoiceStatusResponse>;
  getInvoiceByCorrelationId(
    correlationId: `0x${string}`,
  ): Promise<InvoiceStatusResponse>;
};

export function createMerchantClient(opts: {
  baseUrl: string;
  apiKey: string;
}): MerchantSdkClient {
  const baseUrl = opts.baseUrl.replace(/\/$/, "");

  async function request<T>(
    path: string,
    init: RequestInit & { idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${opts.apiKey}`);
    headers.set("Content-Type", "application/json");
    if (init.idempotencyKey) headers.set("Idempotency-Key", init.idempotencyKey);

    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json?.error?.message ?? `Request failed: ${res.status}`;
      const code = json?.error?.code ?? "UNKNOWN";
      throw new Error(`${code}: ${msg}`);
    }

    return json as T;
  }

  return {
    async createInvoice(input) {
      return request<CreateInvoiceResponse>("/api/merchant/invoices", {
        method: "POST",
        body: JSON.stringify({
          price: input.price,
          dueTimestamp: input.dueTimestamp,
          description: input.description,
        }),
        idempotencyKey: input.idempotencyKey,
      });
    },

    async getInvoiceByInvoiceId(invoiceId) {
      return request<InvoiceStatusResponse>(`/api/merchant/invoices/${invoiceId}`, {
        method: "GET",
      });
    },

    async getInvoiceByCorrelationId(correlationId) {
      return request<InvoiceStatusResponse>(
        `/api/merchant/invoices/by-correlation/${correlationId}`,
        { method: "GET" },
      );
    },
  };
}

