import "server-only";
import { z } from "zod";
import { round2, toNgn } from "@/domain/finance/money";
import { audit } from "@/server/audit/audit";
import { requireScope, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { notify } from "@/server/notify/notify";

const id = z.string().cuid();
const TYPES = ["DOMAIN", "HOSTING", "EMAIL", "LICENCE", "SSL", "SERVICE", "OTHER"] as const;
const CUR = z.enum(["NGN", "USD", "GBP", "EUR"]);

function unitScope(ctx: Ctx, action: "VIEW" | "CREATE" | "EDIT" | "DELETE") {
  const s = requireScope(ctx, "procurement", action);
  return s === "ALL" ? {} : { unitId: { in: ctx.unitIds } };
}

export async function listSuppliers(ctx: Ctx) {
  requireScope(ctx, "procurement", "VIEW");
  const rows = await db.supplier.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { items: true, domains: true, prices: true } } } });
  return rows.map((s) => ({ id: s.id, name: s.name, kind: s.kind, website: s.website, items: s._count.items, domains: s._count.domains, prices: s._count.prices }));
}

export async function saveSupplier(ctx: Ctx, raw: unknown) {
  requireScope(ctx, "procurement", "CREATE");
  const input = z.object({ id: id.optional(), name: z.string().trim().min(2).max(100), kind: z.string().trim().max(40).optional(), website: z.string().trim().url().max(200).optional().or(z.literal("")) }).parse(raw);
  const data = { name: input.name, kind: input.kind || null, website: input.website || null };
  if (input.id) await db.supplier.update({ where: { id: input.id }, data });
  else {
    if (await db.supplier.findUnique({ where: { name: input.name } })) throw new RuleError("That supplier already exists");
    await db.supplier.create({ data });
  }
}

/** Purchases for resale with margin per item and per supplier. */
export async function listResale(ctx: Ctx, raw: unknown) {
  const f = z.object({ unitId: id.nullable().optional(), type: z.enum(TYPES).optional() }).parse(raw ?? {});
  const rows = await db.resaleItem.findMany({
    where: { AND: [unitScope(ctx, "VIEW"), f.unitId ? { unitId: f.unitId } : {}, f.type ? { type: f.type } : {}] },
    include: { supplier: { select: { id: true, name: true } }, contact: { select: { id: true, displayName: true } }, unit: { select: { code: true } } },
    orderBy: { purchasedOn: "desc" },
    take: 500,
  });
  const items = rows.map((r) => {
    const cost = Number(r.costPrice);
    const sale = Number(r.salePrice);
    return {
      id: r.id,
      type: r.type,
      description: r.description,
      supplier: r.supplier,
      customer: r.contact ? { id: r.contact.id, name: r.contact.displayName } : null,
      unit: r.unit.code,
      currency: r.currency,
      cost,
      sale,
      margin: round2(sale - cost),
      marginPct: sale > 0 ? round2(((sale - cost) / sale) * 100) : 0,
      purchasedOn: r.purchasedOn.toISOString().slice(0, 10),
    };
  });
  const bySupplier = new Map<string, { supplier: string; count: number; costNgn: number; saleNgn: number }>();
  for (const r of rows) {
    const fx = r.fxRate ? Number(r.fxRate) : null;
    const key = r.supplier.id;
    const agg = bySupplier.get(key) ?? { supplier: r.supplier.name, count: 0, costNgn: 0, saleNgn: 0 };
    agg.count++;
    agg.costNgn += r.currency === "NGN" ? Number(r.costPrice) : fx ? toNgn(Number(r.costPrice), r.currency, fx) : 0;
    agg.saleNgn += r.currency === "NGN" ? Number(r.salePrice) : fx ? toNgn(Number(r.salePrice), r.currency, fx) : 0;
    bySupplier.set(key, agg);
  }
  return {
    items,
    bySupplier: [...bySupplier.values()].map((s) => ({ ...s, costNgn: round2(s.costNgn), saleNgn: round2(s.saleNgn), margin: round2(s.saleNgn - s.costNgn), marginPct: s.saleNgn ? round2(((s.saleNgn - s.costNgn) / s.saleNgn) * 100) : 0 })).sort((a, b) => b.margin - a.margin),
  };
}

const ResaleInput = z.object({
  unitId: id,
  type: z.enum(TYPES),
  description: z.string().trim().min(2).max(200),
  supplierId: id,
  contactId: id.nullable().default(null),
  costPrice: z.coerce.number().min(0).max(1e12),
  salePrice: z.coerce.number().min(0).max(1e12),
  currency: CUR,
  fxRate: z.coerce.number().positive().nullable().default(null),
  purchasedOn: z.coerce.date(),
});

export async function createResale(ctx: Ctx, raw: unknown) {
  const s = requireScope(ctx, "procurement", "CREATE");
  const input = ResaleInput.parse(raw);
  if (s !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new RuleError("Pick one of your units");
  if (input.currency !== "NGN" && !input.fxRate) throw new RuleError("Enter the exchange rate");
  await db.$transaction(async (tx) => {
    const r = await tx.resaleItem.create({ data: { ...input, fxRate: input.currency === "NGN" ? null : input.fxRate, recordedById: ctx.userId } });
    await audit(tx, { actorId: ctx.userId, action: "resale.create", entityType: "ResaleItem", entityId: r.id, unitId: r.unitId, after: { cost: input.costPrice, sale: input.salePrice, currency: input.currency } });
  });
  if (input.salePrice < input.costPrice) return { warning: "This item is sold below cost." };
  return { warning: null };
}

export async function listDomains(ctx: Ctx, raw: unknown) {
  const f = z.object({ q: z.string().trim().max(80).optional(), expiringDays: z.number().int().min(1).max(365).optional() }).parse(raw ?? {});
  const rows = await db.domain.findMany({
    where: { AND: [unitScope(ctx, "VIEW"), f.q ? { name: { contains: f.q.toLowerCase() } } : {}, f.expiringDays ? { expiresOn: { lte: new Date(Date.now() + f.expiringDays * 86_400_000) } } : {}] },
    include: { registrar: { select: { name: true } }, contact: { select: { id: true, displayName: true } } },
    orderBy: { expiresOn: "asc" },
    take: 500,
  });
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    registrar: d.registrar.name,
    client: d.contact ? { id: d.contact.id, name: d.contact.displayName } : null,
    cost: Number(d.costPrice),
    sell: Number(d.sellPrice),
    currency: d.currency,
    margin: round2(Number(d.sellPrice) - Number(d.costPrice)),
    expiresOn: d.expiresOn.toISOString().slice(0, 10),
    daysLeft: Math.ceil((d.expiresOn.getTime() - Date.now()) / 86_400_000),
    autoRenew: d.autoRenew,
    status: d.status,
  }));
}

const DomainInput = z.object({
  id: id.optional(),
  name: z.string().trim().toLowerCase().regex(/^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{2,63})+$/, "Enter a domain like example.com.ng"),
  unitId: id,
  registrarId: id,
  contactId: id.nullable().default(null),
  costPrice: z.coerce.number().min(0),
  sellPrice: z.coerce.number().min(0),
  currency: CUR,
  expiresOn: z.coerce.date(),
  autoRenew: z.boolean().default(false),
});

export async function saveDomain(ctx: Ctx, raw: unknown) {
  const input = DomainInput.parse(raw);
  const s = requireScope(ctx, "procurement", input.id ? "EDIT" : "CREATE");
  if (s !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new RuleError("Pick one of your units");
  const { id: domainId, ...data } = input;
  await db.$transaction(async (tx) => {
    if (domainId) {
      const before = await tx.domain.findFirst({ where: { AND: [{ id: domainId }, unitScope(ctx, "EDIT")] } });
      if (!before) throw new NotFoundError("Domain");
      await tx.domain.update({ where: { id: domainId }, data });
      await audit(tx, { actorId: ctx.userId, action: "domain.update", entityType: "Domain", entityId: domainId, before: { expiresOn: before.expiresOn.toISOString() }, after: { expiresOn: input.expiresOn.toISOString() } });
    } else {
      if (await tx.domain.findUnique({ where: { name: input.name } })) throw new RuleError("That domain is already in the registry");
      const d = await tx.domain.create({ data });
      await audit(tx, { actorId: ctx.userId, action: "domain.create", entityType: "Domain", entityId: d.id });
    }
  });
}

/** Cheapest supplier per product, and how much we'd save switching. */
export async function priceComparison(ctx: Ctx) {
  requireScope(ctx, "procurement", "VIEW");
  const prices = await db.supplierPrice.findMany({ include: { supplier: { select: { name: true } } }, orderBy: { checkedOn: "desc" } });
  const latest = new Map<string, typeof prices>();
  for (const p of prices) {
    const key = `${p.productKey}|${p.supplierId}`;
    if (!latest.has(key)) latest.set(key, [p]);
  }
  const byProduct = new Map<string, { supplier: string; price: number; currency: string; checkedOn: string }[]>();
  for (const [key, [p]] of latest) {
    const product = key.split("|")[0]!;
    byProduct.set(product, [...(byProduct.get(product) ?? []), { supplier: p!.supplier.name, price: Number(p!.price), currency: p!.currency, checkedOn: p!.checkedOn.toISOString().slice(0, 10) }]);
  }
  return [...byProduct.entries()].map(([product, offers]) => {
    const sorted = offers.sort((a, b) => a.price - b.price);
    return { product, offers: sorted, cheapest: sorted[0]!.supplier, spread: round2(sorted.at(-1)!.price - sorted[0]!.price) };
  });
}

export async function addSupplierPrice(ctx: Ctx, raw: unknown) {
  requireScope(ctx, "procurement", "CREATE");
  const input = z.object({ supplierId: id, productKey: z.string().trim().min(2).max(100), type: z.enum(TYPES), price: z.coerce.number().min(0), currency: CUR }).parse(raw);
  await db.supplierPrice.create({ data: { ...input, checkedOn: new Date() } });
}

/** Daily job: domains expiring in 30, 14, 7 and 1 days alert FigureWeb leads and Finance. */
export async function domainExpiryAlerts(): Promise<number> {
  const soon = await db.domain.findMany({ where: { status: "active", expiresOn: { gte: new Date(), lte: new Date(Date.now() + 31 * 86_400_000) } }, include: { contact: { select: { displayName: true } } } });
  const marks = new Set([30, 14, 7, 1]);
  const people = await db.user.findMany({ where: { status: "ACTIVE", OR: [{ role: { key: "finance" } }, { role: { key: "unit_manager" }, primaryUnit: { code: "FIGUREWEB" } }] }, select: { id: true } });
  let n = 0;
  for (const d of soon) {
    const days = Math.ceil((d.expiresOn.getTime() - Date.now()) / 86_400_000);
    if (!marks.has(days)) continue;
    await notify({ userIds: people.map((p) => p.id), type: "domain.expiry", title: `${d.name} expires in ${days} day${days === 1 ? "" : "s"}`, body: `${d.contact?.displayName ?? "No client linked"} · ${d.autoRenew ? "auto-renew on" : "auto-renew OFF"}`, link: "/money/procurement?tab=domains" });
    n++;
  }
  return n;
}
