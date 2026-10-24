import "server-only";
import { z } from "zod";
import { creditState, incrementLabel, termsLabel } from "@/domain/telecom/rating";
import { audit } from "@/server/audit/audit";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { requireRecentAuth } from "@/server/auth/session";
import { decryptOptional, encryptOptional, maskTail } from "@/server/crypto/field";
import { db } from "@/server/db";
import { accountWhere, carrierWhere } from "./scope";

const id = z.string().cuid();
const email = z.string().trim().toLowerCase().email().max(254).optional().or(z.literal(""));

/** What a postpaid customer owes us now: open invoice balances plus rated, unbilled traffic. */
export async function accountExposure(accountId: string): Promise<number> {
  const [open, unbilled] = await Promise.all([
    db.invoice.findMany({ where: { carrierAccountId: accountId, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } }, select: { total: true, amountPaid: true } }),
    db.trafficEntry.aggregate({ where: { customerAccountId: accountId, invoiceId: null }, _sum: { revenueAmount: true } }),
  ]);
  return open.reduce((n, i) => n + Number(i.total) - Number(i.amountPaid), 0) + Number(unbilled._sum.revenueAmount ?? 0);
}

export async function listCarriers(ctx: Ctx, raw: unknown) {
  const f = z.object({ q: z.string().trim().max(80).optional(), type: z.enum(["VENDOR", "CUSTOMER", "BOTH"]).optional() }).parse(raw ?? {});
  const rows = await db.carrier.findMany({
    where: { AND: [await carrierWhere(ctx, "telecom.carriers", "VIEW"), f.q ? { name: { contains: f.q, mode: "insensitive" } } : {}, f.type ? { type: f.type } : {}] },
    include: { manager: { select: { id: true, name: true } }, accounts: true },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  const seeBalances = can(ctx, "telecom.prepaid", "VIEW");
  return Promise.all(
    rows.map(async (c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      country: c.country,
      isActive: c.isActive,
      manager: c.manager,
      accounts: await Promise.all(
        c.accounts.map(async (a) => {
          const exposure = seeBalances && a.side === "CUSTOMER" && a.paymentMode === "POSTPAID" ? await accountExposure(a.id) : null;
          const limit = a.creditLimit ? Number(a.creditLimit) : null;
          return {
            id: a.id,
            side: a.side,
            currency: a.currency,
            terms: termsLabel(a.billingCycleDays, a.paymentTermDays),
            increments: incrementLabel(a.incrementFirst, a.incrementNext),
            paymentMode: a.paymentMode,
            balance: seeBalances && a.paymentMode === "PREPAID" ? Number(a.prepaidBalance) : null,
            lowBalance: seeBalances && a.paymentMode === "PREPAID" && a.lowBalanceAlert != null && Number(a.prepaidBalance) <= Number(a.lowBalanceAlert),
            exposure,
            creditLimit: seeBalances ? limit : null,
            credit: exposure != null ? creditState(exposure, limit) : "ok",
          };
        }),
      ),
    })),
  );
}

export async function getCarrier(ctx: Ctx, carrierId: string) {
  const c = await db.carrier.findFirst({
    where: { AND: [{ id: carrierId }, await carrierWhere(ctx, "telecom.carriers", "VIEW")] },
    include: { manager: { select: { id: true, name: true } }, accounts: { orderBy: { side: "asc" } } },
  });
  if (!c) throw new NotFoundError("Carrier");
  const seeBank = can(ctx, "telecom.billing", "EDIT");
  const bank = seeBank ? decryptOptional(c.bankDetailsEnc) : null;
  const list = (await listCarriers(ctx, { q: c.name })).find((x) => x.id === c.id);
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    legalName: c.legalName,
    country: c.country,
    address: c.address,
    nocEmail: c.nocEmail,
    billingEmail: c.billingEmail,
    ratesEmail: c.ratesEmail,
    contacts: (c.contacts as { name: string; role?: string; phone?: string; email?: string }[] | null) ?? [],
    nettingEnabled: c.nettingEnabled,
    manager: c.manager,
    notes: c.notes,
    isActive: c.isActive,
    bankDetailsMasked: c.bankDetailsEnc ? (seeBank && bank ? maskTail(bank.replace(/\s+/g, " ")) : "On file") : null,
    accounts: c.accounts.map((a) => ({
      id: a.id,
      side: a.side,
      currency: a.currency,
      billingCycleDays: a.billingCycleDays,
      paymentTermDays: a.paymentTermDays,
      incrementFirst: a.incrementFirst,
      incrementNext: a.incrementNext,
      paymentMode: a.paymentMode,
      creditLimit: a.creditLimit != null ? Number(a.creditLimit) : null,
      lowBalanceAlert: a.lowBalanceAlert != null ? Number(a.lowBalanceAlert) : null,
      cycleAnchor: a.cycleAnchor.toISOString().slice(0, 10),
      ...(list?.accounts.find((x) => x.id === a.id) ?? {}),
    })),
  };
}

const CarrierInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(2).max(120),
  type: z.enum(["VENDOR", "CUSTOMER", "BOTH"]),
  legalName: z.string().trim().max(200).optional(),
  country: z.string().trim().max(80).optional(),
  address: z.string().trim().max(400).optional(),
  nocEmail: email,
  billingEmail: email,
  ratesEmail: email,
  contacts: z.array(z.object({ name: z.string().trim().min(1).max(100), role: z.string().trim().max(60).optional(), phone: z.string().trim().max(40).optional(), email: email })).max(20).default([]),
  managerId: id.nullable().default(null),
  nettingEnabled: z.boolean().default(false),
  notes: z.string().trim().max(2000).optional(),
  isActive: z.boolean().default(true),
  currency: z.enum(["USD", "NGN", "GBP", "EUR"]).default("USD"),
});

export async function saveCarrier(ctx: Ctx, raw: unknown): Promise<{ id: string }> {
  const input = CarrierInput.parse(raw);
  requireScope(ctx, "telecom.carriers", input.id ? "EDIT" : "CREATE");
  const { id: carrierId, currency, ...fields } = input;
  const data = {
    ...fields,
    legalName: fields.legalName || null,
    country: fields.country || null,
    address: fields.address || null,
    nocEmail: fields.nocEmail || null,
    billingEmail: fields.billingEmail || null,
    ratesEmail: fields.ratesEmail || null,
    notes: fields.notes || null,
    nettingEnabled: fields.type === "BOTH" && fields.nettingEnabled,
  };
  const sides = data.type === "BOTH" ? (["VENDOR", "CUSTOMER"] as const) : ([data.type] as const);
  return db.$transaction(async (tx) => {
    let cid = carrierId;
    if (cid) {
      const before = await tx.carrier.findFirst({ where: { AND: [{ id: cid }, await carrierWhere(ctx, "telecom.carriers", "EDIT")] } });
      if (!before) throw new NotFoundError("Carrier");
      if (data.name !== before.name && (await tx.carrier.findUnique({ where: { name: data.name } }))) throw new RuleError("Another carrier has that name");
      await tx.carrier.update({ where: { id: cid }, data });
      await audit(tx, { actorId: ctx.userId, action: "carrier.update", entityType: "Carrier", entityId: cid, before: { type: before.type, isActive: before.isActive }, after: { type: data.type, isActive: data.isActive } });
    } else {
      if (await tx.carrier.findUnique({ where: { name: data.name } })) throw new RuleError("That carrier already exists");
      cid = (await tx.carrier.create({ data })).id;
      await audit(tx, { actorId: ctx.userId, action: "carrier.create", entityType: "Carrier", entityId: cid, after: { name: data.name, type: data.type } });
    }
    for (const side of sides) {
      await tx.carrierAccount.upsert({ where: { carrierId_side: { carrierId: cid, side } }, update: {}, create: { carrierId: cid, side, currency } });
    }
    return { id: cid };
  });
}

/** Bank details are field-encrypted; changing them needs billing rights and a fresh password. */
export async function saveCarrierBankDetails(ctx: Ctx, raw: unknown) {
  const { carrierId, details } = z.object({ carrierId: id, details: z.string().trim().max(1000) }).parse(raw);
  if (!can(ctx, "telecom.billing", "EDIT")) throw new ForbiddenError("telecom.billing:EDIT");
  const c = await db.carrier.findFirst({ where: { AND: [{ id: carrierId }, await carrierWhere(ctx, "telecom.carriers", "VIEW")] } });
  if (!c) throw new NotFoundError("Carrier");
  await requireRecentAuth(ctx);
  await db.$transaction(async (tx) => {
    await tx.carrier.update({ where: { id: c.id }, data: { bankDetailsEnc: encryptOptional(details || null) } });
    await audit(tx, { actorId: ctx.userId, action: "carrier.bank_details", entityType: "Carrier", entityId: c.id, after: { changed: true } }); // never the details themselves
  });
}

const AccountInput = z.object({
  accountId: id,
  currency: z.enum(["USD", "NGN", "GBP", "EUR"]),
  billingCycleDays: z.coerce.number().int().min(1).max(31),
  paymentTermDays: z.coerce.number().int().min(0).max(90),
  incrementFirst: z.coerce.number().int().min(1).max(60),
  incrementNext: z.coerce.number().int().min(1).max(60),
  paymentMode: z.enum(["PREPAID", "POSTPAID"]),
  cycleAnchor: z.coerce.date(),
  creditLimit: z.coerce.number().min(0).max(1e10).nullable().optional(),
  lowBalanceAlert: z.coerce.number().min(0).max(1e10).nullable().optional(),
});

export async function saveAccount(ctx: Ctx, raw: unknown) {
  const input = AccountInput.parse(raw);
  const a = await db.carrierAccount.findFirst({ where: { AND: [{ id: input.accountId }, await accountWhere(ctx, "telecom.carriers", "EDIT")] } });
  if (!a) throw new NotFoundError("Account");
  const creditChanged = (input.creditLimit !== undefined && (input.creditLimit ?? null) !== (a.creditLimit != null ? Number(a.creditLimit) : null)) || (input.lowBalanceAlert !== undefined && (input.lowBalanceAlert ?? null) !== (a.lowBalanceAlert != null ? Number(a.lowBalanceAlert) : null));
  if (creditChanged && !can(ctx, "telecom.prepaid", "EDIT")) throw new ForbiddenError("telecom.prepaid:EDIT");
  if (input.currency !== a.currency && (await db.trafficEntry.count({ where: { OR: [{ vendorAccountId: a.id }, { customerAccountId: a.id }] } }))) throw new RuleError("Traffic is already rated in this account's currency");
  await db.$transaction(async (tx) => {
    await tx.carrierAccount.update({
      where: { id: a.id },
      data: {
        currency: input.currency,
        billingCycleDays: input.billingCycleDays,
        paymentTermDays: input.paymentTermDays,
        incrementFirst: input.incrementFirst,
        incrementNext: input.incrementNext,
        paymentMode: input.paymentMode,
        cycleAnchor: input.cycleAnchor,
        ...(creditChanged ? { creditLimit: input.creditLimit ?? null, lowBalanceAlert: input.lowBalanceAlert ?? null } : {}),
      },
    });
    await audit(tx, {
      actorId: ctx.userId,
      action: "carrier_account.update",
      entityType: "CarrierAccount",
      entityId: a.id,
      before: { terms: termsLabel(a.billingCycleDays, a.paymentTermDays), increments: incrementLabel(a.incrementFirst, a.incrementNext), mode: a.paymentMode, creditLimit: a.creditLimit != null ? Number(a.creditLimit) : null },
      after: { terms: termsLabel(input.billingCycleDays, input.paymentTermDays), increments: incrementLabel(input.incrementFirst, input.incrementNext), mode: input.paymentMode, creditLimit: input.creditLimit ?? null },
    });
  });
}

/** Accounts for pickers (traffic entry, decks, billing). */
export async function accountOptions(ctx: Ctx, side?: "VENDOR" | "CUSTOMER") {
  const rows = await db.carrierAccount.findMany({
    where: { AND: [await accountWhere(ctx, "telecom.carriers", "VIEW"), side ? { side } : {}, { carrier: { isActive: true } }] },
    include: { carrier: { select: { name: true } } },
    orderBy: { carrier: { name: "asc" } },
  });
  return rows.map((a) => ({ id: a.id, label: `${a.carrier.name} · ${a.side === "VENDOR" ? "vendor" : "customer"}`, carrier: a.carrier.name, side: a.side, currency: a.currency, paymentMode: a.paymentMode }));
}
