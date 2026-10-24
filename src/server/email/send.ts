import "server-only";
import type { EmailKind } from "@prisma/client";
import { db } from "@/server/db";

export interface OutgoingEmail {
  to: string;
  subject: string;
  /** Plain text; rendered into the branded HTML layout with all content escaped. */
  text: string;
  kind?: EmailKind;
  template?: string;
  contactId?: string | null;
  cta?: { label: string; url: string };
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

export function renderHtml(e: OutgoingEmail): string {
  const paras = e.text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const cta = e.cta
    ? `<p style="margin:22px 0"><a href="${escapeHtml(e.cta.url)}" style="background:#4f46e5;color:#fff;padding:10px 16px;border-radius:7px;text-decoration:none;font-weight:600">${escapeHtml(e.cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f6f6f8;font:14px/1.55 -apple-system,Segoe UI,Inter,Arial,sans-serif;color:#18181b">
<div style="max-width:560px;margin:0 auto;padding:28px 20px"><div style="font-weight:700;margin-bottom:18px">Figuraid</div>
<div style="background:#fff;border:1px solid #e7e7ea;border-radius:12px;padding:24px">${paras}${cta}</div>
<p style="color:#8a8a93;font-size:12px;margin-top:16px">Figuraid Ltd · Abuja, Nigeria</p></div></body></html>`;
}

/**
 * Send through Brevo when BREVO_API_KEY is set; otherwise the email is only
 * recorded in the outbox (EmailMessage) and logged — useful in development.
 * Marketing kinds respect the suppression list (unsubscribes, bounces).
 */
export async function sendEmail(e: OutgoingEmail): Promise<{ id: string; status: string }> {
  const to = e.to.trim().toLowerCase();
  const kind = e.kind ?? "TRANSACTIONAL";
  if (kind === "SEQUENCE" || kind === "BROADCAST") {
    if (await db.suppression.findUnique({ where: { email: to } })) {
      const row = await db.emailMessage.create({ data: { kind, toEmail: to, subject: e.subject, contactId: e.contactId ?? null, template: e.template, status: "suppressed" } });
      return { id: row.id, status: "suppressed" };
    }
  }
  const row = await db.emailMessage.create({
    data: { kind, toEmail: to, subject: e.subject, contactId: e.contactId ?? null, template: e.template, status: "queued" },
  });

  const key = process.env.BREVO_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "test") console.info(`[email:dev] to=${to} subject="${e.subject}"`);
    await db.emailMessage.update({ where: { id: row.id }, data: { status: "logged" } });
    return { id: row.id, status: "logged" };
  }
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        sender: { name: "Figuraid", email: process.env.BREVO_SENDER_EMAIL ?? "hello@figuraid.com" },
        to: [{ email: to }],
        subject: e.subject,
        htmlContent: renderHtml(e),
        textContent: e.text + (e.cta ? `\n\n${e.cta.label}: ${e.cta.url}` : ""),
        headers: { "X-Figuraid-Message": row.id },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as { messageId?: string };
    const status = res.ok ? "sent" : "failed";
    await db.emailMessage.update({ where: { id: row.id }, data: { status, providerId: body.messageId ?? null, sentAt: res.ok ? new Date() : null } });
    return { id: row.id, status };
  } catch (err) {
    console.error("[email] Brevo send failed", err);
    await db.emailMessage.update({ where: { id: row.id }, data: { status: "failed" } });
    return { id: row.id, status: "failed" };
  }
}

export function appUrl(path = "/"): string {
  return new URL(path, process.env.NEXTAUTH_URL ?? "http://localhost:3000").toString();
}
