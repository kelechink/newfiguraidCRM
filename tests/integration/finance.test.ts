import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError, ReauthRequiredError, RuleError } from "@/server/authz/errors";
import { loadCtx } from "@/server/authz/context";
import { db } from "@/server/db";
import { verifyPaystackSignature } from "@/server/integrations/paystack";
import { convertQuote, getInvoice, listInvoices, recordInvoicePayment, saveInvoice, voidInvoice } from "@/server/modules/finance/invoices-service";
import { createExpense, decideExpense, listExpenses, recordProviderPayment } from "@/server/modules/finance/money-service";
import { saveDomain } from "@/server/modules/finance/procurement-service";
import { listSubscriptions, saveSubscription } from "@/server/modules/finance/subscriptions-service";
import { ctxFor, ensureRolesAndUnits, makeUser } from "./world";

let units: Awaited<ReturnType<typeof ensureRolesAndUnits>>;
let finance: { id: string }, finance2: { id: string }, webLead: { id: string }, staff: { id: string }, telStaff: { id: string }, auditor: { id: string };
let category: { id: string };
const rnd = () => Math.random().toString(36).slice(2, 8);
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  units = await ensureRolesAndUnits();
  finance = await makeUser({ role: "finance", unitId: units.HQ });
  finance2 = await makeUser({ role: "finance", unitId: units.HQ });
  webLead = await makeUser({ role: "unit_manager", unitId: units.FIGUREWEB });
  staff = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
  telStaff = await makeUser({ role: "staff", unitId: units.TELECOM });
  auditor = await makeUser({ role: "auditor", unitId: units.HQ });
  category = await db.expenseCategory.upsert({ where: { name: "Transport" }, update: {}, create: { name: "Transport" } });
});

const invoiceFor = (unitId: string, kind: "INVOICE" | "QUOTE" = "INVOICE") => ({
  kind,
  unitId,
  issueDate: today(),
  dueDate: inDays(14),
  vatRate: 7.5,
  lines: [{ description: `Hosting ${rnd()}`, quantity: 2, unitPrice: 50_000, vatable: true }, { description: "Setup", quantity: 1, unitPrice: 20_000, vatable: false }],
});

describe("invoices", () => {
  it("numbers sequentially per unit and year, with separate quote series", async () => {
    const ctx = await ctxFor(finance.id);
    const a = await saveInvoice(ctx, invoiceFor(units.FIGUREWEB));
    const b = await saveInvoice(ctx, invoiceFor(units.FIGUREWEB));
    const q = await saveInvoice(ctx, invoiceFor(units.FIGUREWEB, "QUOTE"));
    const year = new Date().getUTCFullYear();
    expect(a.number).toMatch(new RegExp(`^FIG-WEB-${year}-\\d{4}$`));
    expect(Number(b.number.slice(-4))).toBe(Number(a.number.slice(-4)) + 1);
    expect(q.number).toMatch(new RegExp(`^Q-WEB-${year}-\\d{4}$`));
    const inv = await getInvoice(ctx, a.id);
    expect(inv.subtotal).toBe(120_000);
    expect(inv.vatAmount).toBe(7_500); // VAT only on the vatable 100,000
    expect(inv.total).toBe(127_500);
  });

  it("is invisible to roles without invoice access, and read-only for the auditor", async () => {
    const ctx = await ctxFor(finance.id);
    const { id } = await saveInvoice(ctx, invoiceFor(units.TELECOM));
    await expect(listInvoices(await ctxFor(staff.id), {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(getInvoice(await ctxFor(webLead.id), id)).rejects.toBeInstanceOf(ForbiddenError);
    const aud = await ctxFor(auditor.id);
    expect((await getInvoice(aud, id)).id).toBe(id);
    await expect(saveInvoice(aud, invoiceFor(units.TELECOM))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("tracks part and full payment, refuses overpayment and payment on drafts", async () => {
    const ctx = await ctxFor(finance.id);
    const { id } = await saveInvoice(ctx, invoiceFor(units.FIGUREWEB));
    const pay = (amount: number) => recordInvoicePayment(ctx, { invoiceId: id, amount, method: "BANK_TRANSFER", receivedAt: today() });
    await expect(pay(1000)).rejects.toBeInstanceOf(RuleError);
    await db.invoice.update({ where: { id }, data: { status: "SENT" } });
    await pay(27_500);
    expect((await getInvoice(ctx, id)).status).toBe("PARTIALLY_PAID");
    await expect(pay(100_000.01)).rejects.toBeInstanceOf(RuleError);
    await pay(100_000);
    const done = await getInvoice(ctx, id);
    expect(done.status).toBe("PAID");
    expect(done.amountPaid).toBe(127_500);
    await expect(voidInvoice(ctx, { invoiceId: id, reason: "Wrong customer" })).rejects.toBeInstanceOf(RuleError);
  });

  it("only edits drafts, and converting a quote creates a draft invoice", async () => {
    const ctx = await ctxFor(finance.id);
    const q = await saveInvoice(ctx, invoiceFor(units.ACADEMY, "QUOTE"));
    const { id } = await convertQuote(ctx, q.id);
    const inv = await getInvoice(ctx, id);
    expect(inv.kind).toBe("INVOICE");
    expect(inv.status).toBe("DRAFT");
    expect(inv.total).toBe(127_500);
    expect((await getInvoice(ctx, q.id)).status).toBe("ACCEPTED");
    await db.invoice.update({ where: { id }, data: { status: "SENT" } });
    await expect(saveInvoice(ctx, { ...invoiceFor(units.ACADEMY), id })).rejects.toBeInstanceOf(RuleError);
  });

  it("requires a fresh password to void or record payments", async () => {
    const session = await db.userSession.create({ data: { userId: finance.id, createdAt: new Date(Date.now() - 60 * 60_000), expiresAt: new Date(Date.now() + 3_600_000) } });
    const stale = await loadCtx(finance.id, session.id);
    const { id } = await saveInvoice(stale, invoiceFor(units.HQ));
    await expect(voidInvoice(stale, { invoiceId: id, reason: "Duplicate" })).rejects.toBeInstanceOf(ReauthRequiredError);
    await db.invoice.update({ where: { id }, data: { status: "SENT" } });
    await expect(recordInvoicePayment(stale, { invoiceId: id, amount: 10, method: "CASH", receivedAt: today() })).rejects.toBeInstanceOf(ReauthRequiredError);
    await db.userSession.update({ where: { id: session.id }, data: { reauthAt: new Date() } });
    await voidInvoice(await loadCtx(finance.id, session.id), { invoiceId: id, reason: "Duplicate" });
    expect((await db.invoice.findUniqueOrThrow({ where: { id } })).status).toBe("VOID");
  });
});

describe("provider payments", () => {
  it("verifies Paystack signatures and records each reference once", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_signature_check";
    const body = JSON.stringify({ event: "charge.success", data: { reference: "x" } });
    const sig = createHmac("sha512", "sk_test_signature_check").update(body).digest("hex");
    expect(verifyPaystackSignature(body, sig)).toBe(true);
    expect(verifyPaystackSignature(body + " ", sig)).toBe(false);
    expect(verifyPaystackSignature(body, null)).toBe(false);
    delete process.env.PAYSTACK_SECRET_KEY;
    expect(verifyPaystackSignature(body, sig)).toBe(false); // no key configured → reject everything

    const ctx = await ctxFor(finance.id);
    const { id } = await saveInvoice(ctx, invoiceFor(units.FIGUREWEB));
    await db.invoice.update({ where: { id }, data: { status: "SENT" } });
    const ref = `PSK-${rnd()}`;
    const p = { method: "PAYSTACK" as const, reference: ref, amount: 127_500, currency: "NGN" as const, receivedAt: new Date(), invoiceId: id, unitCode: "FIGUREWEB" as const, description: "Paystack" };
    expect((await recordProviderPayment(p)).created).toBe(true);
    expect((await recordProviderPayment(p)).created).toBe(false);
    expect(await db.payment.count({ where: { providerRef: ref } })).toBe(1);
    expect((await getInvoice(ctx, id)).status).toBe("PAID");
  });
});

describe("expenses", () => {
  const claim = (unitId: string, amount = 4500) => {
    const f = new FormData();
    f.set("unitId", unitId);
    f.set("categoryId", category.id);
    f.set("description", `Uber to client ${rnd()}`);
    f.set("amount", String(amount));
    f.set("currency", "NGN");
    f.set("incurredOn", today());
    return f;
  };

  it("staff claim in their own unit only and see only their own claims", async () => {
    const mine = await createExpense(await ctxFor(staff.id), claim(units.FIGUREWEB));
    const other = await createExpense(await ctxFor(telStaff.id), claim(units.TELECOM));
    await expect(createExpense(await ctxFor(staff.id), claim(units.TELECOM))).rejects.toBeInstanceOf(ForbiddenError);
    const seen = (await listExpenses(await ctxFor(staff.id), {})).map((e) => e.id);
    expect(seen).toContain(mine.id);
    expect(seen).not.toContain(other.id);
    const leadSees = (await listExpenses(await ctxFor(webLead.id), {})).map((e) => e.id);
    expect(leadSees).toContain(mine.id);
    expect(leadSees).not.toContain(other.id);
  });

  it("nobody approves their own expense; staff can't approve at all", async () => {
    const own = await createExpense(await ctxFor(finance.id), claim(units.HQ));
    await expect(decideExpense(await ctxFor(finance.id), { expenseId: own.id, approve: true })).rejects.toBeInstanceOf(RuleError);
    await decideExpense(await ctxFor(finance2.id), { expenseId: own.id, approve: true });
    expect((await db.expense.findUniqueOrThrow({ where: { id: own.id } })).status).toBe("APPROVED");

    const s = await createExpense(await ctxFor(staff.id), claim(units.FIGUREWEB));
    await expect(decideExpense(await ctxFor(staff.id), { expenseId: s.id, approve: true })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(decideExpense(await ctxFor(finance.id), { expenseId: s.id, approve: false })).rejects.toBeInstanceOf(RuleError); // rejection needs a reason
  });
});

describe("subscriptions & procurement", () => {
  it("normalises to naira per month and flags duplicates; never stores full card numbers", async () => {
    const ctx = await ctxFor(finance.id);
    const name = `Canva ${rnd()}`;
    await saveSubscription(ctx, { name, vendor: "Canva", unitId: units.HQ, cost: 120, currency: "USD", recurrence: "ANNUAL", renewalDate: inDays(20), cardLast4: "4242" });
    await saveSubscription(ctx, { name, vendor: "Canva", unitId: units.FIGUREWEB, cost: 10, currency: "USD", recurrence: "MONTHLY", renewalDate: inDays(5) });
    await expect(saveSubscription(ctx, { name: "X tool", vendor: "X", unitId: units.HQ, cost: 1, currency: "USD", recurrence: "MONTHLY", renewalDate: inDays(5), cardLast4: "4242424242424242" })).rejects.toThrow();
    const { items } = await listSubscriptions(ctx);
    const rows = items.filter((i) => i.name === name);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.flags.includes("duplicate"))).toBe(true);
    const usd = Number((await db.setting.findUnique({ where: { key: "finance.usd_ngn_rate" } }))?.value ?? 1550);
    expect(rows.find((r) => r.recurrence === "ANNUAL")!.monthlyNgn).toBeCloseTo(10 * usd, 2);
  });

  it("validates domain names and refuses edits outside the caller's scope", async () => {
    const ctx = await ctxFor(finance.id);
    const reg = await db.supplier.upsert({ where: { name: "Whogohost" }, update: {}, create: { name: "Whogohost", kind: "registrar" } });
    const base = { unitId: units.FIGUREWEB, registrarId: reg.id, costPrice: 9000, sellPrice: 15000, currency: "NGN", expiresOn: inDays(300) };
    await expect(saveDomain(ctx, { ...base, name: "not a domain" })).rejects.toThrow();
    const name = `t${rnd()}.com.ng`;
    await saveDomain(ctx, { ...base, name });
    const d = await db.domain.findUniqueOrThrow({ where: { name } });
    await expect(saveDomain(await ctxFor(webLead.id), { ...base, id: d.id, name })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

