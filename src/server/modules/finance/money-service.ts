import "server-only";
import { z } from "zod";
import { round2, toNgn } from "@/domain/finance/money";
import { audit } from "@/server/audit/audit";
import { can, requireScope, scopeOf, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { requireRecentAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { signedFileUrl, storeFile } from "@/server/files/upload";
import { notify } from "@/server/notify/notify";
import { refreshInvoicePaid } from "./invoices-service";
import { billWhere, expenseWhere, paymentWhere } from "./scope";

const id = z.string().cuid();
const CUR = z.enum(["NGN", "USD", "GBP", "EUR"]);

// ── income ───────────────────────────────────────────────────────────────────

export async function listPayments(ctx: Ctx, raw: unknown) {
  const f = z.object({ unitId: id.nullable().optional(), method: z.string().max(20).optional(), from: z.string().optional(), to: z.string().optional() }).parse(raw ?? {});
  const rows = await db.payment.findMany({
    where: {
      AND: [
        paymentWhere(ctx, "VIEW"),
        f.unitId ? { unitId: f.unitId } : {},
        f.method ? { method: f.method as never } : {},
        f.from ? { receivedAt: { gte: new Date(f.from) } } : {},
        f.to ? { receivedAt: { lte: new Date(`${f.to}T23:59:59Z`) } } : {},
      ],
    },
    orderBy: { receivedAt: "desc" },
    take: 300,
    include: { invoice: { select: { id: true, number: true } }, contact: { select: { displayName: true } }, carrierAccount: { select: { carrier: { select: { name: true } } } }, unit: { select: { code: true } }, recordedBy: { select: { name: true } } },
  });
  return rows.map((p) => ({
    id: p.id,
    unit: p.unit.code,
    amount: Number(p.amount),
    currency: p.currency,
    amountNgn: Number(p.amountNgn),
    method: p.method,
    status: p.status,
    reference: p.providerRef,
    invoice: p.invoice,
    payer: p.contact?.displayName ?? p.carrierAccount?.carrier.name ?? p.description ?? "—",
    receivedAt: p.receivedAt.toISOString(),
    recordedBy: p.recordedBy?.name ?? (p.method === "PAYSTACK" || p.method === "WHMCS" ? "Automatic" : null),
  }));
}

const ManualIncome = z.object({
  unitId: id,
  amount: z.coerce.number().positive().max(1e13),
  currency: CUR,
  fxRate: z.coerce.number().positive().nullable().default(null),
  method: z.enum(["BANK_TRANSFER", "CASH", "POS", "CARD", "OTHER"]),
  receivedAt: z.coerce.date(),
  description: z.string().trim().min(3).max(300),
  reference: z.string().trim().max(120).optional(),
  carrierAccountId: id.nullable().optional(),
  bankAccountId: id.nullable().optional(),
});

/** Bank transfers and telecom receipts not tied to an invoice. */
export async function recordIncome(ctx: Ctx, raw: unknown) {
  const scope = requireScope(ctx, "finance.income", "CREATE");
  const input = ManualIncome.parse(raw);
  if (scope !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new ForbiddenError("finance.income unit");
  if (input.currency !== "NGN" && !input.fxRate) throw new RuleError("Enter the exchange rate used");
  await requireRecentAuth(ctx);
  if (input.reference && (await db.payment.count({ where: { method: input.method, providerRef: input.reference } }))) throw new RuleError("A payment with that reference is already recorded");
  await db.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        unitId: input.unitId,
        amount: input.amount,
        currency: input.currency,
        fxRate: input.currency === "NGN" ? null : input.fxRate,
        amountNgn: toNgn(input.amount, input.currency, input.fxRate),
        method: input.method,
        status: "CONFIRMED",
        providerRef: input.reference || null,
        description: input.description,
        receivedAt: input.receivedAt,
        reconciledAt: new Date(),
        carrierAccountId: input.carrierAccountId ?? null,
        bankAccountId: input.bankAccountId ?? null,
        recordedById: ctx.userId,
      },
    });
    await audit(tx, { actorId: ctx.userId, action: "payment.record", entityType: "Payment", entityId: p.id, unitId: input.unitId, after: { amount: input.amount, currency: input.currency, method: input.method } });
  });
}

/**
 * Provider payment (Paystack/WHMCS) arriving from a verified webhook. Idempotent on
 * (method, providerRef). The caller must already have re-verified with the provider API.
 */
export async function recordProviderPayment(input: {
  method: "PAYSTACK" | "WHMCS";
  reference: string;
  amount: number;
  currency: "NGN" | "USD";
  receivedAt: Date;
  invoiceId?: string | null;
  unitCode: "ACADEMY" | "FIGUREWEB" | "TELECOM" | "HQ";
  payerEmail?: string | null;
  description: string;
}): Promise<{ created: boolean; paymentId: string }> {
  const existing = await db.payment.findUnique({ where: { method_providerRef: { method: input.method, providerRef: input.reference } } });
  if (existing) return { created: false, paymentId: existing.id };
  const unit = await db.businessUnit.findUniqueOrThrow({ where: { code: input.unitCode } });
  const invoice = input.invoiceId ? await db.invoice.findUnique({ where: { id: input.invoiceId } }) : null;
  const fx = input.currency === "NGN" ? null : Number((await db.setting.findUnique({ where: { key: "finance.usd_ngn_rate" } }))?.value ?? 1550);
  const contact = input.payerEmail ? await db.contact.findFirst({ where: { emailNormalized: input.payerEmail.toLowerCase(), deletedAt: null } }) : null;
  return db.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        unitId: invoice?.unitId ?? unit.id,
        amount: input.amount,
        currency: input.currency,
        fxRate: fx,
        amountNgn: toNgn(input.amount, input.currency, fx),
        method: input.method,
        status: "CONFIRMED",
        providerRef: input.reference,
        invoiceId: invoice?.id ?? null,
        contactId: invoice?.contactId ?? contact?.id ?? null,
        description: input.description,
        receivedAt: input.receivedAt,
        reconciledAt: new Date(),
      },
    });
    if (invoice) await refreshInvoicePaid(tx, invoice.id);
    if (p.contactId) await tx.activity.create({ data: { type: "PAYMENT", contactId: p.contactId, summary: `${input.method === "PAYSTACK" ? "Paystack" : "WHMCS"} payment ${input.currency} ${input.amount.toLocaleString("en-NG")}`, refType: "payment", refId: p.id } });
    await audit(tx, { actorId: null, actorType: "webhook", action: "payment.provider", entityType: "Payment", entityId: p.id, unitId: p.unitId, after: { method: input.method, reference: input.reference, amount: input.amount } });
    return { created: true, paymentId: p.id };
  });
}

// ── expenses ─────────────────────────────────────────────────────────────────

export async function listExpenses(ctx: Ctx, raw: unknown) {
  const f = z.object({ status: z.string().max(20).optional(), unitId: id.nullable().optional(), mine: z.boolean().optional() }).parse(raw ?? {});
  const rows = await db.expense.findMany({
    where: { AND: [expenseWhere(ctx, "VIEW"), f.unitId ? { unitId: f.unitId } : {}, f.status ? { status: f.status as never } : {}, f.mine ? { submittedById: ctx.userId } : {}] },
    orderBy: [{ incurredOn: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: { category: { select: { name: true } }, unit: { select: { code: true } }, submittedBy: { select: { id: true, name: true } }, approvedBy: { select: { name: true } } },
  });
  const canApprove = !!scopeOf(ctx, "finance.expenses", "APPROVE");
  return rows.map((e) => ({
    id: e.id,
    unit: e.unit.code,
    category: e.category.name,
    description: e.description,
    vendor: e.vendor,
    amount: Number(e.amount),
    currency: e.currency,
    amountNgn: Number(e.amountNgn),
    incurredOn: e.incurredOn.toISOString().slice(0, 10),
    status: e.status,
    submittedBy: e.submittedBy,
    approvedBy: e.approvedBy?.name ?? null,
    rejectionNote: e.rejectionNote,
    receiptUrl: e.receiptFileId ? signedFileUrl(e.receiptFileId, ctx.userId, 900) : null,
    canDecide: canApprove && e.status === "SUBMITTED" && e.submittedBy.id !== ctx.userId,
  }));
}

const ExpenseFields = z.object({
  unitId: id,
  categoryId: id,
  description: z.string().trim().min(3).max(300),
  vendor: z.string().trim().max(120).optional(),
  amount: z.coerce.number().positive().max(1e12),
  currency: CUR,
  fxRate: z.coerce.number().positive().optional(),
  incurredOn: z.coerce.date(),
  submit: z.enum(["true", "false"]).default("true"),
});

export async function createExpense(ctx: Ctx, form: FormData): Promise<{ id: string }> {
  const scope = requireScope(ctx, "finance.expenses", "CREATE");
  const input = ExpenseFields.parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")));
  if (scope !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new ForbiddenError("finance.expenses unit");
  if (input.currency !== "NGN" && !input.fxRate) throw new RuleError("Enter the exchange rate used");
  if (input.incurredOn > new Date(Date.now() + 86_400_000)) throw new RuleError("The date can't be in the future");
  const receipt = form.get("receipt");
  let receiptFileId: string | null = null;
  if (receipt && typeof receipt !== "string" && receipt.size > 0) {
    receiptFileId = (await storeFile({ bytes: Buffer.from(await receipt.arrayBuffer()), filename: receipt.name, purpose: "receipt", userId: ctx.userId })).id;
  }
  const submit = input.submit === "true";
  const e = await db.$transaction(async (tx) => {
    const row = await tx.expense.create({
      data: {
        unitId: input.unitId,
        categoryId: input.categoryId,
        description: input.description,
        vendor: input.vendor || null,
        amount: input.amount,
        currency: input.currency,
        fxRate: input.currency === "NGN" ? null : input.fxRate,
        amountNgn: toNgn(input.amount, input.currency, input.fxRate ?? null),
        incurredOn: input.incurredOn,
        receiptFileId,
        status: submit ? "SUBMITTED" : "DRAFT",
        submittedById: ctx.userId,
      },
    });
    await audit(tx, { actorId: ctx.userId, action: "expense.create", entityType: "Expense", entityId: row.id, unitId: row.unitId, after: { amount: input.amount, currency: input.currency, status: row.status } });
    return row;
  });
  if (submit) {
    const approvers = await db.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["finance"] } } }, select: { id: true } });
    await notify({ userIds: approvers.map((a) => a.id), type: "expense.submitted", title: `${ctx.name} submitted an expense`, body: `${input.currency} ${input.amount.toLocaleString("en-NG")} · ${input.description}`, link: "/money/expenses?status=SUBMITTED" });
  }
  return { id: e.id };
}

export async function decideExpense(ctx: Ctx, raw: unknown) {
  const { expenseId, approve, note } = z.object({ expenseId: id, approve: z.boolean(), note: z.string().trim().max(500).optional() }).parse(raw);
  const e = await db.expense.findFirst({ where: { AND: [{ id: expenseId }, expenseWhere(ctx, "APPROVE")] } });
  if (!e) throw new NotFoundError("Expense");
  if (e.submittedById === ctx.userId) throw new RuleError("Someone else must approve your own expense");
  if (e.status !== "SUBMITTED") throw new RuleError("Only submitted expenses can be decided");
  if (!approve && !note) throw new RuleError("Say why it's rejected");
  await requireRecentAuth(ctx);
  await db.$transaction(async (tx) => {
    await tx.expense.update({ where: { id: e.id }, data: { status: approve ? "APPROVED" : "REJECTED", approvedById: ctx.userId, approvedAt: new Date(), rejectionNote: approve ? null : note } });
    await audit(tx, { actorId: ctx.userId, action: approve ? "expense.approve" : "expense.reject", entityType: "Expense", entityId: e.id, unitId: e.unitId, after: { note: note ?? null } });
  });
  await notify({ userIds: [e.submittedById], type: "expense.decided", title: `Your expense was ${approve ? "approved" : "rejected"}`, body: approve ? e.description : note, link: "/money/expenses?mine=1" });
}

export async function markExpensePaid(ctx: Ctx, raw: unknown) {
  const { expenseId, bankAccountId } = z.object({ expenseId: id, bankAccountId: id.nullable().optional() }).parse(raw);
  const e = await db.expense.findFirst({ where: { AND: [{ id: expenseId }, expenseWhere(ctx, "APPROVE")] } });
  if (!e) throw new NotFoundError("Expense");
  if (e.status !== "APPROVED") throw new RuleError("Approve it first");
  await requireRecentAuth(ctx);
  await db.$transaction(async (tx) => {
    await tx.expense.update({ where: { id: e.id }, data: { status: "PAID", paidAt: new Date(), bankAccountId: bankAccountId ?? null } });
    await audit(tx, { actorId: ctx.userId, action: "expense.paid", entityType: "Expense", entityId: e.id, unitId: e.unitId });
  });
}

export async function expenseCategories() {
  return db.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

// ── bills (payables) ─────────────────────────────────────────────────────────

export async function listBills(ctx: Ctx, raw: unknown) {
  const f = z.object({ status: z.string().max(20).optional(), unitId: id.nullable().optional() }).parse(raw ?? {});
  const rows = await db.bill.findMany({
    where: { AND: [billWhere(ctx, "VIEW"), f.unitId ? { unitId: f.unitId } : {}, f.status ? { status: f.status as never } : { status: { not: "VOID" } }] },
    orderBy: { dueDate: "asc" },
    take: 300,
    include: { carrierAccount: { select: { carrier: { select: { name: true } } } }, unit: { select: { code: true } } },
  });
  return rows.map((b) => ({
    id: b.id,
    number: b.number,
    unit: b.unit.code,
    supplier: b.supplierName ?? b.carrierAccount?.carrier.name ?? "—",
    currency: b.currency,
    total: Number(b.total),
    amountPaid: Number(b.amountPaid),
    issueDate: b.issueDate.toISOString().slice(0, 10),
    dueDate: b.dueDate.toISOString().slice(0, 10),
    status: b.status,
    period: b.periodStart && b.periodEnd ? `${b.periodStart.toISOString().slice(0, 10)} → ${b.periodEnd.toISOString().slice(0, 10)}` : null,
  }));
}

const BillInput = z.object({
  unitId: id,
  supplierName: z.string().trim().min(2).max(160),
  number: z.string().trim().max(60).optional(),
  currency: CUR,
  fxRate: z.coerce.number().positive().nullable().default(null),
  total: z.coerce.number().positive().max(1e13),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
});

export async function createBill(ctx: Ctx, raw: unknown) {
  const scope = requireScope(ctx, "finance.bills", "CREATE");
  const input = BillInput.parse(raw);
  if (scope !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new ForbiddenError("finance.bills unit");
  if (input.currency !== "NGN" && !input.fxRate) throw new RuleError("Enter the exchange rate");
  await db.$transaction(async (tx) => {
    const b = await tx.bill.create({ data: { ...input, number: input.number || null, fxRate: input.currency === "NGN" ? null : input.fxRate, status: "DRAFT" } });
    await audit(tx, { actorId: ctx.userId, action: "bill.create", entityType: "Bill", entityId: b.id, unitId: b.unitId, after: { total: input.total, currency: input.currency } });
  });
}

export async function approveBill(ctx: Ctx, billId: string) {
  const b = await db.bill.findFirst({ where: { AND: [{ id: billId }, billWhere(ctx, "APPROVE")] } });
  if (!b) throw new NotFoundError("Bill");
  if (b.status !== "DRAFT") throw new RuleError("Already approved");
  await requireRecentAuth(ctx);
  await db.$transaction(async (tx) => {
    await tx.bill.update({ where: { id: b.id }, data: { status: "APPROVED", approvedById: ctx.userId } });
    await audit(tx, { actorId: ctx.userId, action: "bill.approve", entityType: "Bill", entityId: b.id, unitId: b.unitId });
  });
}

export async function payBill(ctx: Ctx, raw: unknown) {
  const { billId, amount } = z.object({ billId: id, amount: z.coerce.number().positive() }).parse(raw);
  const b = await db.bill.findFirst({ where: { AND: [{ id: billId }, billWhere(ctx, "APPROVE")] } });
  if (!b) throw new NotFoundError("Bill");
  if (!["APPROVED", "PARTIALLY_PAID"].includes(b.status)) throw new RuleError("Approve the bill before paying it");
  const paid = round2(Number(b.amountPaid) + amount);
  if (paid > Number(b.total) + 0.005) throw new RuleError("That's more than the balance");
  await requireRecentAuth(ctx);
  await db.$transaction(async (tx) => {
    await tx.bill.update({ where: { id: b.id }, data: { amountPaid: paid, status: paid >= Number(b.total) - 0.005 ? "PAID" : "PARTIALLY_PAID" } });
    await audit(tx, { actorId: ctx.userId, action: "bill.pay", entityType: "Bill", entityId: b.id, unitId: b.unitId, after: { amount } });
  });
}

export async function bankAccounts(ctx: Ctx) {
  if (!can(ctx, "finance.income", "VIEW")) return [];
  const rows = await db.bankAccount.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
  return rows.map((b) => ({ id: b.id, name: b.name, bankName: b.bankName, last4: b.accountLast4, currency: b.currency }));
}
