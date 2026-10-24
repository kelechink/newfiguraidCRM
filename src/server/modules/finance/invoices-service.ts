import "server-only";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { invoiceStatusFor, invoiceTotals, round2, toNgn } from "@/domain/finance/money";
import { audit } from "@/server/audit/audit";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { requireRecentAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { appUrl, sendEmail } from "@/server/email/send";
import { initializePayment, paystackEnabled } from "@/server/integrations/paystack";
import { invoicePdf } from "@/server/pdf/invoice";
import { getSetting } from "@/server/modules/settings/service";
import { contactWhere } from "@/server/modules/crm/scope";
import { invoiceWhere, UNIT_PREFIX } from "./scope";

const id = z.string().cuid();

type Tx = Prisma.TransactionClient;

/** FIG-WEB-2026-0042. Serialised per unit+year with an advisory lock so numbers never collide. */
export async function nextInvoiceNumber(tx: Tx, unitId: string, kind: "INVOICE" | "QUOTE" | "CREDIT_NOTE", date = new Date()): Promise<string> {
  const unit = await tx.businessUnit.findUniqueOrThrow({ where: { id: unitId } });
  const year = date.getUTCFullYear();
  const prefix = `${kind === "QUOTE" ? "Q" : kind === "CREDIT_NOTE" ? "CN" : "FIG"}-${UNIT_PREFIX[unit.code] ?? "HQ"}-${year}-`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${prefix}))`;
  const last = await tx.invoice.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

// ── list & detail ────────────────────────────────────────────────────────────

const ListInput = z.object({
  status: z.enum(["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID", "ACCEPTED", "DECLINED", "OPEN"]).optional(),
  kind: z.enum(["INVOICE", "QUOTE", "CREDIT_NOTE"]).optional(),
  unitId: id.nullable().optional(),
  q: z.string().trim().max(80).optional(),
});

export async function listInvoices(ctx: Ctx, raw: unknown) {
  const f = ListInput.parse(raw ?? {});
  const rows = await db.invoice.findMany({
    where: {
      AND: [
        invoiceWhere(ctx, "VIEW"),
        f.unitId ? { unitId: f.unitId } : {},
        f.kind ? { kind: f.kind } : { kind: { not: "QUOTE" } },
        f.status === "OPEN" ? { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } } : f.status ? { status: f.status } : {},
        f.q ? { OR: [{ number: { contains: f.q, mode: "insensitive" } }, { contact: { displayName: { contains: f.q, mode: "insensitive" } } }, { company: { name: { contains: f.q, mode: "insensitive" } } }, { carrierAccount: { carrier: { name: { contains: f.q, mode: "insensitive" } } } }] } : {},
      ],
    },
    orderBy: [{ issueDate: "desc" }, { number: "desc" }],
    take: 200,
    include: { contact: { select: { displayName: true } }, company: { select: { name: true } }, carrierAccount: { select: { carrier: { select: { name: true } } } }, unit: { select: { code: true } } },
  });
  return rows.map((i) => ({
    id: i.id,
    number: i.number,
    kind: i.kind,
    status: i.status,
    unit: i.unit.code,
    customer: i.company?.name ?? i.contact?.displayName ?? i.carrierAccount?.carrier.name ?? "—",
    currency: i.currency,
    total: Number(i.total),
    amountPaid: Number(i.amountPaid),
    issueDate: i.issueDate.toISOString(),
    dueDate: i.dueDate.toISOString(),
  }));
}

export async function getInvoice(ctx: Ctx, invoiceId: string) {
  const i = await db.invoice.findFirst({
    where: { AND: [{ id: invoiceId }, invoiceWhere(ctx, "VIEW")] },
    include: {
      lines: { orderBy: { position: "asc" } },
      payments: { orderBy: { receivedAt: "desc" }, include: { recordedBy: { select: { name: true } } } },
      contact: { select: { id: true, displayName: true, email: true, phoneE164: true } },
      company: { select: { name: true } },
      carrierAccount: { select: { id: true, carrier: { select: { id: true, name: true, billingEmail: true } } } },
      unit: { select: { id: true, code: true, name: true } },
      owner: { select: { name: true } },
    },
  });
  if (!i) throw new NotFoundError("Invoice");
  return {
    id: i.id,
    number: i.number,
    kind: i.kind,
    status: i.status,
    unit: i.unit,
    owner: i.owner?.name ?? null,
    contact: i.contact ? { id: i.contact.id, name: i.contact.displayName, email: i.contact.email, phone: i.contact.phoneE164 } : null,
    company: i.company?.name ?? null,
    carrier: i.carrierAccount ? { accountId: i.carrierAccount.id, id: i.carrierAccount.carrier.id, name: i.carrierAccount.carrier.name, email: i.carrierAccount.carrier.billingEmail } : null,
    currency: i.currency,
    fxRate: i.fxRate ? Number(i.fxRate) : null,
    subtotal: Number(i.subtotal),
    vatRate: Number(i.vatRate),
    vatAmount: Number(i.vatAmount),
    total: Number(i.total),
    amountPaid: Number(i.amountPaid),
    issueDate: i.issueDate.toISOString().slice(0, 10),
    dueDate: i.dueDate.toISOString().slice(0, 10),
    periodStart: i.periodStart?.toISOString() ?? null,
    periodEnd: i.periodEnd?.toISOString() ?? null,
    notes: i.notes,
    sentAt: i.sentAt?.toISOString() ?? null,
    payLink: i.paystackLinkRef ? `https://checkout.paystack.com/${i.paystackLinkRef}` : null,
    lines: i.lines.map((l) => ({ id: l.id, description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), amount: Number(l.amount), vatable: l.vatable })),
    payments: i.payments.map((p) => ({ id: p.id, amount: Number(p.amount), currency: p.currency, method: p.method, status: p.status, receivedAt: p.receivedAt.toISOString(), reference: p.providerRef, recordedBy: p.recordedBy?.name ?? null })),
    canEdit: i.status === "DRAFT" && can(ctx, "finance.invoices", "EDIT") && (await db.invoice.count({ where: { AND: [{ id: i.id }, invoiceWhere(ctx, "EDIT")] } })) > 0,
  };
}

// ── create / edit ────────────────────────────────────────────────────────────

const InvoiceInput = z.object({
  id: id.optional(),
  kind: z.enum(["INVOICE", "QUOTE", "CREDIT_NOTE"]).default("INVOICE"),
  unitId: id,
  contactId: id.nullable().default(null),
  dealId: id.nullable().default(null),
  currency: z.enum(["NGN", "USD", "GBP", "EUR"]).default("NGN"),
  fxRate: z.coerce.number().positive().nullable().default(null),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  vatRate: z.coerce.number().min(0).max(50),
  notes: z.string().trim().max(2000).optional(),
  lines: z
    .array(z.object({ description: z.string().trim().min(1).max(500), quantity: z.coerce.number().positive().max(1e9), unitPrice: z.coerce.number().min(0).max(1e12), vatable: z.boolean().default(true) }))
    .min(1, "Add at least one line")
    .max(200),
});

export async function saveInvoice(ctx: Ctx, raw: unknown): Promise<{ id: string; number: string }> {
  const input = InvoiceInput.parse(raw);
  const scope = requireScope(ctx, "finance.invoices", input.id ? "EDIT" : "CREATE");
  if (scope !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new ForbiddenError("finance.invoices unit");
  if (input.dueDate < input.issueDate) throw new RuleError("The due date can't be before the issue date");
  if (input.currency !== "NGN" && !input.fxRate) throw new RuleError("Enter the exchange rate to NGN for this invoice");
  if (input.contactId && !(await db.contact.count({ where: { id: input.contactId, deletedAt: null } }))) throw new NotFoundError("Contact");
  const t = invoiceTotals(input.lines, input.vatRate);
  const data = {
    kind: input.kind,
    unitId: input.unitId,
    contactId: input.contactId,
    companyId: input.contactId ? ((await db.contact.findUnique({ where: { id: input.contactId }, select: { companyId: true } }))?.companyId ?? null) : null,
    dealId: input.dealId,
    currency: input.currency,
    fxRate: input.currency === "NGN" ? null : input.fxRate,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    vatRate: input.vatRate,
    vatAmount: t.vatAmount,
    subtotal: t.subtotal,
    total: t.total,
    notes: input.notes || null,
  };
  const lines = input.lines.map((l, i) => ({ position: i + 1, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: t.lines[i]!, vatable: l.vatable }));
  return db.$transaction(async (tx) => {
    if (input.id) {
      const existing = await tx.invoice.findFirst({ where: { AND: [{ id: input.id }, invoiceWhere(ctx, "EDIT")] } });
      if (!existing) throw new NotFoundError("Invoice");
      if (existing.status !== "DRAFT") throw new RuleError("Only drafts can be edited — void it and issue a new one");
      await tx.invoiceLine.deleteMany({ where: { invoiceId: existing.id } });
      await tx.invoice.update({ where: { id: existing.id }, data: { ...data, lines: { create: lines } } });
      await audit(tx, { actorId: ctx.userId, action: "invoice.update", entityType: "Invoice", entityId: existing.id, unitId: input.unitId, before: { total: Number(existing.total) }, after: { total: t.total } });
      return { id: existing.id, number: existing.number };
    }
    const number = await nextInvoiceNumber(tx, input.unitId, input.kind, input.issueDate);
    const inv = await tx.invoice.create({ data: { ...data, number, ownerId: ctx.userId, status: "DRAFT", lines: { create: lines } } });
    await audit(tx, { actorId: ctx.userId, action: "invoice.create", entityType: "Invoice", entityId: inv.id, unitId: input.unitId, after: { number, total: t.total, currency: input.currency } });
    return { id: inv.id, number };
  });
}

// ── PDF & sending ────────────────────────────────────────────────────────────

export async function renderInvoicePdf(ctx: Ctx, invoiceId: string): Promise<{ filename: string; base64: string }> {
  const inv = await getInvoice(ctx, invoiceId);
  const bytes = await invoicePdfFor(inv);
  return { filename: `${inv.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
}

async function invoicePdfFor(inv: Awaited<ReturnType<typeof getInvoice>>) {
  const bank = await db.setting.findUnique({ where: { key: `finance.bank_instructions.${inv.currency}` } });
  return invoicePdf({
    kind: inv.kind,
    number: inv.number,
    unitName: inv.unit.name,
    issueDate: new Date(inv.issueDate),
    dueDate: new Date(inv.dueDate),
    currency: inv.currency,
    billTo: { name: inv.contact?.name ?? inv.carrier?.name ?? "Customer", company: inv.company ?? (inv.carrier ? inv.carrier.name : null), email: inv.contact?.email ?? inv.carrier?.email, phone: inv.contact?.phone },
    period: inv.periodStart && inv.periodEnd ? { start: new Date(inv.periodStart), end: new Date(inv.periodEnd) } : null,
    lines: inv.lines,
    subtotal: inv.subtotal,
    vatRate: inv.vatRate,
    vatAmount: inv.vatAmount,
    total: inv.total,
    amountPaid: inv.amountPaid,
    notes: inv.notes,
    payLink: inv.payLink,
    bankInstructions: (bank?.value as string | undefined) ?? "Pay to Figuraid Ltd. Quote the invoice number as the payment reference.",
  });
}

/** Mark sent, create a Paystack link for NGN invoices, and email the customer. */
export async function sendInvoice(ctx: Ctx, invoiceId: string) {
  const inv = await db.invoice.findFirst({
    where: { AND: [{ id: invoiceId }, invoiceWhere(ctx, "EDIT")] },
    include: { contact: true, carrierAccount: { include: { carrier: true } } },
  });
  if (!inv) throw new NotFoundError("Invoice");
  if (inv.status === "VOID" || inv.status === "PAID") throw new RuleError("This invoice can't be sent");
  const to = inv.contact?.email ?? inv.carrierAccount?.carrier.billingEmail;
  if (!to) throw new RuleError("Add an email address for the customer first");
  let payRef = inv.paystackLinkRef;
  if (!payRef && inv.kind === "INVOICE" && inv.currency === "NGN" && paystackEnabled()) {
    const ref = `${inv.number}-${Date.now().toString(36)}`;
    const p = await initializePayment({ email: to, amountNgn: Number(inv.total) - Number(inv.amountPaid), reference: ref, invoiceId: inv.id, callbackUrl: appUrl("/l/paid") });
    payRef = p.authorization_url.split("/").pop() ?? null;
  }
  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id: inv.id }, data: { status: inv.status === "DRAFT" ? "SENT" : inv.status, sentAt: new Date(), paystackLinkRef: payRef } });
    await audit(tx, { actorId: ctx.userId, action: "invoice.send", entityType: "Invoice", entityId: inv.id, unitId: inv.unitId, after: { to } });
  });
  const full = await getInvoice(ctx, inv.id);
  const pdf = await invoicePdfFor(full);
  const word = inv.kind === "QUOTE" ? "quote" : "invoice";
  await sendEmail({
    to,
    subject: `Figuraid ${word} ${inv.number}`,
    text: `Hello ${inv.contact?.firstName ?? inv.contact?.displayName ?? inv.carrierAccount?.carrier.name ?? ""},\n\nPlease find your ${word} ${inv.number} for ${inv.currency} ${Number(inv.total).toLocaleString("en-NG", { minimumFractionDigits: 2 })}, due ${inv.dueDate.toDateString()}.\n\nA PDF copy is available from your account manager. Thank you for your business.`,
    contactId: inv.contactId,
    template: `invoice_${word}`,
    cta: full.payLink ? { label: "Pay securely with Paystack", url: full.payLink } : undefined,
  });
  void pdf; // attachments go through Brevo once the sender domain is verified
}

export async function voidInvoice(ctx: Ctx, raw: unknown) {
  const { invoiceId, reason } = z.object({ invoiceId: id, reason: z.string().trim().min(3).max(500) }).parse(raw);
  const inv = await db.invoice.findFirst({ where: { AND: [{ id: invoiceId }, invoiceWhere(ctx, "DELETE")] } });
  if (!inv) throw new NotFoundError("Invoice");
  if (Number(inv.amountPaid) > 0) throw new RuleError("Payments are recorded against this invoice — issue a credit note instead");
  await requireRecentAuth(ctx);
  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id: inv.id }, data: { status: "VOID" } });
    await tx.trafficEntry.updateMany({ where: { invoiceId: inv.id }, data: { invoiceId: null } });
    await audit(tx, { actorId: ctx.userId, action: "invoice.void", entityType: "Invoice", entityId: inv.id, unitId: inv.unitId, before: { status: inv.status }, after: { reason } });
  });
}

export async function convertQuote(ctx: Ctx, quoteId: string): Promise<{ id: string }> {
  const q = await db.invoice.findFirst({ where: { AND: [{ id: quoteId, kind: "QUOTE" }, invoiceWhere(ctx, "EDIT")] }, include: { lines: true } });
  if (!q) throw new NotFoundError("Quote");
  requireScope(ctx, "finance.invoices", "CREATE");
  const days = Math.max(7, Math.round((q.dueDate.getTime() - q.issueDate.getTime()) / 86_400_000));
  return db.$transaction(async (tx) => {
    const number = await nextInvoiceNumber(tx, q.unitId, "INVOICE");
    const inv = await tx.invoice.create({
      data: {
        number,
        kind: "INVOICE",
        status: "DRAFT",
        unitId: q.unitId,
        ownerId: ctx.userId,
        contactId: q.contactId,
        companyId: q.companyId,
        dealId: q.dealId,
        currency: q.currency,
        fxRate: q.fxRate,
        subtotal: q.subtotal,
        vatRate: q.vatRate,
        vatAmount: q.vatAmount,
        total: q.total,
        issueDate: new Date(),
        dueDate: new Date(Date.now() + days * 86_400_000),
        notes: q.notes,
        lines: { create: q.lines.map((l) => ({ position: l.position, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount, vatable: l.vatable })) },
      },
    });
    await tx.invoice.update({ where: { id: q.id }, data: { status: "ACCEPTED" } });
    await audit(tx, { actorId: ctx.userId, action: "quote.convert", entityType: "Invoice", entityId: inv.id, unitId: q.unitId, after: { from: q.number, to: number } });
    return { id: inv.id };
  });
}

// ── payments against invoices ────────────────────────────────────────────────

/** Recompute paid amount and status from confirmed payments. Call inside the payment transaction. */
export async function refreshInvoicePaid(tx: Tx, invoiceId: string) {
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const payments = await tx.payment.findMany({ where: { invoiceId, status: "CONFIRMED" } });
  const paid = round2(
    payments.reduce((n, p) => n + (p.currency === inv.currency ? Number(p.amount) : Number(p.amountNgn) / (inv.fxRate ? Number(inv.fxRate) : 1)), 0),
  );
  const status = invoiceStatusFor(Number(inv.total), paid, inv.dueDate, new Date(), inv.status) as InvoiceStatus;
  await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status, paidAt: status === "PAID" ? (inv.paidAt ?? new Date()) : null } });
  return { paid, status };
}

const PaymentInput = z.object({
  invoiceId: id,
  amount: z.coerce.number().positive().max(1e13),
  method: z.enum(["BANK_TRANSFER", "CASH", "POS", "CARD", "OTHER"]),
  receivedAt: z.coerce.date(),
  reference: z.string().trim().max(120).optional(),
  bankAccountId: id.nullable().optional(),
});

export async function recordInvoicePayment(ctx: Ctx, raw: unknown) {
  const input = PaymentInput.parse(raw);
  requireScope(ctx, "finance.income", "CREATE");
  const inv = await db.invoice.findFirst({ where: { AND: [{ id: input.invoiceId }, invoiceWhere(ctx, "VIEW")] } });
  if (!inv) throw new NotFoundError("Invoice");
  if (inv.status === "VOID" || inv.status === "DRAFT" || inv.kind !== "INVOICE") throw new RuleError("Send the invoice before recording payment");
  const outstanding = Number(inv.total) - Number(inv.amountPaid);
  if (input.amount > outstanding + 0.005) throw new RuleError(`That's more than the ${outstanding.toFixed(2)} outstanding`);
  await requireRecentAuth(ctx);
  await db.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        unitId: inv.unitId,
        amount: input.amount,
        currency: inv.currency,
        fxRate: inv.fxRate,
        amountNgn: toNgn(input.amount, inv.currency, inv.fxRate ? Number(inv.fxRate) : null),
        method: input.method,
        status: "CONFIRMED",
        providerRef: input.reference || null,
        invoiceId: inv.id,
        contactId: inv.contactId,
        carrierAccountId: inv.carrierAccountId,
        bankAccountId: input.bankAccountId ?? null,
        description: `Payment for ${inv.number}`,
        receivedAt: input.receivedAt,
        reconciledAt: new Date(),
        recordedById: ctx.userId,
      },
    });
    const r = await refreshInvoicePaid(tx, inv.id);
    if (inv.contactId) await tx.activity.create({ data: { type: "PAYMENT", contactId: inv.contactId, actorId: ctx.userId, summary: `Paid ${inv.currency} ${input.amount.toLocaleString("en-NG")} on ${inv.number}`, refType: "invoice", refId: inv.id } });
    await audit(tx, { actorId: ctx.userId, action: "payment.record", entityType: "Payment", entityId: p.id, unitId: inv.unitId, after: { invoice: inv.number, amount: input.amount, method: input.method, status: r.status } });
  });
}

/** Nightly: flip unpaid invoices past their due date to OVERDUE. */
export async function markOverdue(): Promise<number> {
  const r = await db.invoice.updateMany({ where: { kind: "INVOICE", status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: { lt: new Date() } }, data: { status: "OVERDUE" } });
  return r.count;
}

export async function defaultVatRate() {
  return Number(await getSetting("finance.vat_rate_pct"));
}

export function canSeeMoney(ctx: Ctx) {
  return can(ctx, "finance.invoices", "VIEW") || can(ctx, "finance.reports", "VIEW");
}

/**
 * Customers the editor may bill. CRM users see their CRM scope; finance users without
 * CRM access get billing identity only (name, email) for units their invoice scope covers.
 */
export async function invoiceCustomers(ctx: Ctx) {
  const scope = requireScope(ctx, "finance.invoices", "CREATE");
  const where: Prisma.ContactWhereInput = can(ctx, "crm.contacts", "VIEW")
    ? contactWhere(ctx, "VIEW")
    : { deletedAt: null, mergedIntoId: null, ...(scope === "ALL" ? {} : { unitId: { in: ctx.unitIds } }) };
  const rows = await db.contact.findMany({
    where: { AND: [where, { lifecycle: { not: "ARCHIVED" } }] },
    orderBy: [{ lastActivityAt: { sort: "desc", nulls: "last" } }, { displayName: "asc" }],
    take: 300,
    select: { id: true, displayName: true, email: true, unitId: true, company: { select: { name: true } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.company ? `${c.displayName} · ${c.company.name}` : c.displayName, email: c.email, unitId: c.unitId }));
}
