import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Paystack (Academy and other NGN collections). All calls are server-side with the secret key.

const API = "https://api.paystack.co";

export function paystackEnabled() {
  return !!process.env.PAYSTACK_SECRET_KEY;
}

/** x-paystack-signature = HMAC-SHA512(raw body, secret key) (Security #6). */
export function verifyPaystackSignature(rawBody: string, signature: string | null): boolean {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const expected = Buffer.from(createHmac("sha512", key).update(rawBody).digest("hex"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, "content-type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || !body.status) throw new Error(`Paystack: ${body.message ?? res.status}`);
  return body.data;
}

/** Hosted payment page for an invoice. Amount in naira; Paystack wants kobo. */
export async function initializePayment(input: { email: string; amountNgn: number; reference: string; invoiceId: string; callbackUrl: string }) {
  return call<{ authorization_url: string; reference: string }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      amount: Math.round(input.amountNgn * 100),
      currency: "NGN",
      reference: input.reference,
      callback_url: input.callbackUrl,
      metadata: { invoiceId: input.invoiceId },
    }),
  });
}

/** Re-check a transaction with Paystack before marking anything paid — webhooks alone are never trusted. */
export async function verifyTransaction(reference: string) {
  return call<{ status: string; amount: number; currency: string; reference: string; paid_at: string | null; customer: { email: string }; metadata: { invoiceId?: string } | null }>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
}
