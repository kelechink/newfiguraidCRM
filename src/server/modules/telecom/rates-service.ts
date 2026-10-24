import "server-only";
import type { Prisma, RouteType } from "@prisma/client";
import { z } from "zod";
import { csvCell, parseRateDeck, round4 } from "@/domain/telecom/rating";
import { audit } from "@/server/audit/audit";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { storeFile } from "@/server/files/upload";
import { accountWhere, canSeeBuy, canSeeMargin } from "./scope";

const id = z.string().cuid();
type Tx = Prisma.TransactionClient;
const NOTICE_DAYS = 7; // rate increases to customers need a week's notice

/** Writing a vendor (buy) rate is sensitive; customer (sell) rates sit with routes. */
function requireRateWrite(ctx: Ctx, side: "VENDOR" | "CUSTOMER") {
  if (side === "VENDOR") {
    if (!can(ctx, "telecom.buy_rates", "CREATE") && !can(ctx, "telecom.buy_rates", "EDIT")) throw new ForbiddenError("telecom.buy_rates:EDIT");
  } else requireScope(ctx, "telecom.routes", "EDIT");
}

export async function listRoutes(ctx: Ctx, raw: unknown) {
  requireScope(ctx, "telecom.routes", "VIEW");
  const f = z.object({ q: z.string().trim().max(80).optional(), type: z.enum(["TDM", "CC", "CLI"]).optional() }).parse(raw ?? {});
  const seeBuy = canSeeBuy(ctx);
  const seeMargin = canSeeMargin(ctx);
  const rows = await db.route.findMany({
    where: { AND: [f.type ? { routeType: f.type } : {}, f.q ? { OR: [{ destination: { contains: f.q, mode: "insensitive" } }, { prefix: { startsWith: f.q.replace(/\D/g, "") || "~" } }] } : {}] },
    include: {
      manager: { select: { name: true } },
      rates: { where: { effectiveTo: null, ...(seeBuy ? {} : { carrierAccount: { side: "CUSTOMER" } }) }, include: { carrierAccount: { select: { side: true, carrier: { select: { name: true } } } } } },
    },
    orderBy: [{ isActive: "desc" }, { destination: "asc" }],
    take: 500,
  });
  return rows.map((r) => {
    const sell = r.rates.filter((x) => x.carrierAccount.side === "CUSTOMER").map((x) => ({ carrier: x.carrierAccount.carrier.name, rate: Number(x.ratePerMin), currency: x.currency }));
    const buy = seeBuy ? r.rates.filter((x) => x.carrierAccount.side === "VENDOR").map((x) => ({ carrier: x.carrierAccount.carrier.name, rate: Number(x.ratePerMin), currency: x.currency })).sort((a, b) => a.rate - b.rate) : null;
    const minSell = sell.length ? Math.min(...sell.map((s) => s.rate)) : null;
    const best = buy?.[0]?.rate ?? null;
    return {
      id: r.id,
      destination: r.destination,
      prefix: r.prefix,
      routeType: r.routeType,
      isActive: r.isActive,
      qualityNotes: r.qualityNotes,
      manager: r.manager?.name ?? null,
      sell: sell.sort((a, b) => a.rate - b.rate),
      buy,
      // worst-case margin per minute: cheapest sell against cheapest buy
      marginPerMin: seeMargin && minSell != null && best != null ? round4(minSell - best) : null,
    };
  });
}

const RouteInput = z.object({
  id: id.optional(),
  destination: z.string().trim().min(2).max(120),
  prefix: z.string().trim().regex(/^\d{1,15}$/, "Digits only, e.g. 234803"),
  routeType: z.enum(["TDM", "CC", "CLI"]),
  qualityNotes: z.string().trim().max(500).optional(),
  managerId: id.nullable().default(null),
  isActive: z.boolean().default(true),
});

export async function saveRoute(ctx: Ctx, raw: unknown) {
  const input = RouteInput.parse(raw);
  requireScope(ctx, "telecom.routes", input.id ? "EDIT" : "CREATE");
  const clash = await db.route.findUnique({ where: { prefix_routeType: { prefix: input.prefix, routeType: input.routeType } } });
  if (clash && clash.id !== input.id) throw new RuleError(`${input.routeType} ${input.prefix} already exists (${clash.destination})`);
  const { id: routeId, ...data } = input;
  await db.$transaction(async (tx) => {
    const r = routeId ? await tx.route.update({ where: { id: routeId }, data: { ...data, qualityNotes: data.qualityNotes || null } }) : await tx.route.create({ data: { ...data, qualityNotes: data.qualityNotes || null } });
    await audit(tx, { actorId: ctx.userId, action: routeId ? "route.update" : "route.create", entityType: "Route", entityId: r.id, after: { prefix: r.prefix, type: r.routeType } });
  });
}

/**
 * Insert a rate into the append-only history: the rate it supersedes gets an end date,
 * and a later future-dated rate (if any) caps this one.
 */
export async function insertRate(tx: Tx, input: { routeId: string; accountId: string; ratePerMin: number; currency: string; effectiveFrom: Date; createdById: string; rateDeckId?: string | null }) {
  const same = await tx.rate.findFirst({ where: { routeId: input.routeId, carrierAccountId: input.accountId, effectiveFrom: input.effectiveFrom } });
  if (same) {
    if (Number(same.ratePerMin) === input.ratePerMin) return { id: same.id, changed: false, previous: Number(same.ratePerMin) };
    const used = await tx.trafficEntry.count({ where: { OR: [{ buyRateId: same.id }, { sellRateId: same.id }] } });
    if (used) throw new RuleError(`A rate starting ${input.effectiveFrom.toISOString().slice(0, 10)} is already used for rated traffic — pick a new effective date`);
    await tx.rate.update({ where: { id: same.id }, data: { ratePerMin: input.ratePerMin, rateDeckId: input.rateDeckId ?? same.rateDeckId } });
    return { id: same.id, changed: true, previous: Number(same.ratePerMin) };
  }
  const prev = await tx.rate.findFirst({ where: { routeId: input.routeId, carrierAccountId: input.accountId, effectiveFrom: { lt: input.effectiveFrom } }, orderBy: { effectiveFrom: "desc" } });
  const next = await tx.rate.findFirst({ where: { routeId: input.routeId, carrierAccountId: input.accountId, effectiveFrom: { gt: input.effectiveFrom } }, orderBy: { effectiveFrom: "asc" } });
  if (prev && (!prev.effectiveTo || prev.effectiveTo > input.effectiveFrom)) {
    const ratedAfter = await tx.trafficEntry.count({ where: { OR: [{ buyRateId: prev.id }, { sellRateId: prev.id }], periodStart: { gte: input.effectiveFrom } } });
    if (ratedAfter) throw new RuleError("Traffic after that date was already rated on the old rate — re-rate it or choose a later date");
    await tx.rate.update({ where: { id: prev.id }, data: { effectiveTo: input.effectiveFrom } });
  }
  const r = await tx.rate.create({
    data: { routeId: input.routeId, carrierAccountId: input.accountId, ratePerMin: input.ratePerMin, currency: input.currency as never, effectiveFrom: input.effectiveFrom, effectiveTo: next?.effectiveFrom ?? null, createdById: input.createdById, rateDeckId: input.rateDeckId ?? null },
  });
  return { id: r.id, changed: true, previous: prev ? Number(prev.ratePerMin) : null };
}

const RateInput = z.object({ routeId: id, accountId: id, ratePerMin: z.coerce.number().min(0).max(100), effectiveFrom: z.coerce.date() });

export async function setRate(ctx: Ctx, raw: unknown) {
  const input = RateInput.parse(raw);
  const account = await db.carrierAccount.findFirst({ where: { AND: [{ id: input.accountId }, await accountWhere(ctx, "telecom.carriers", "VIEW")] } });
  if (!account) throw new NotFoundError("Account");
  requireRateWrite(ctx, account.side);
  if (!(await db.route.count({ where: { id: input.routeId } }))) throw new NotFoundError("Route");
  await db.$transaction(async (tx) => {
    const r = await insertRate(tx, { ...input, currency: account.currency, createdById: ctx.userId });
    await audit(tx, { actorId: ctx.userId, action: account.side === "VENDOR" ? "rate.buy" : "rate.sell", entityType: "Rate", entityId: r.id, after: { route: input.routeId, from: input.effectiveFrom.toISOString(), changed: r.changed } });
  });
}

export async function rateHistory(ctx: Ctx, raw: unknown) {
  requireScope(ctx, "telecom.routes", "VIEW");
  const { routeId } = z.object({ routeId: id }).parse(raw);
  const rows = await db.rate.findMany({
    where: { routeId, carrierAccount: { ...(await accountWhere(ctx, "telecom.carriers", "VIEW")), ...(canSeeBuy(ctx) ? {} : { side: "CUSTOMER" as const }) } },
    include: { carrierAccount: { select: { side: true, carrier: { select: { name: true } } } }, createdBy: { select: { name: true } } },
    orderBy: [{ effectiveFrom: "desc" }],
    take: 200,
  });
  return rows.map((r) => ({ id: r.id, carrier: r.carrierAccount.carrier.name, side: r.carrierAccount.side, rate: Number(r.ratePerMin), currency: r.currency, from: r.effectiveFrom.toISOString(), to: r.effectiveTo?.toISOString() ?? null, by: r.createdBy.name }));
}

/** Upload a rate deck for one account: creates missing routes, versions every changed rate. */
export async function importRateDeck(ctx: Ctx, form: FormData) {
  const meta = z.object({ accountId: id, routeType: z.enum(["TDM", "CC", "CLI"]), effectiveFrom: z.coerce.date() }).parse({ accountId: form.get("accountId"), routeType: form.get("routeType"), effectiveFrom: form.get("effectiveFrom") });
  const account = await db.carrierAccount.findFirst({ where: { AND: [{ id: meta.accountId }, await accountWhere(ctx, "telecom.carriers", "VIEW")] }, include: { carrier: { select: { name: true } } } });
  if (!account) throw new NotFoundError("Account");
  requireRateWrite(ctx, account.side);
  requireScope(ctx, "telecom.routes", account.side === "CUSTOMER" ? "EDIT" : "VIEW");
  const file = form.get("file");
  if (!file || typeof file === "string" || file.size === 0) throw new RuleError("Choose a CSV file");
  const bytes = Buffer.from(await file.arrayBuffer());
  const stored = await storeFile({ bytes, filename: file.name, purpose: "ratedeck", userId: ctx.userId });
  const { rows, errors } = parseRateDeck(bytes.toString("utf8"));
  if (!rows.length) throw new RuleError(errors[0]?.message ?? "No rates found in that file");
  if (rows.length > 20_000) throw new RuleError("Decks over 20,000 rows: split the file");
  const canCreateRoutes = can(ctx, "telecom.routes", "CREATE");
  const noticeCutoff = Date.now() + NOTICE_DAYS * 86_400_000;
  const result = { created: 0, changed: 0, unchanged: 0, newRoutes: 0, increasesWithoutNotice: [] as string[], errors: [...errors] };

  await db.$transaction(
    async (tx) => {
      const deck = await tx.rateDeck.create({ data: { carrierAccountId: account.id, direction: account.side === "VENDOR" ? "import" : "export", fileId: stored.id, effectiveFrom: meta.effectiveFrom, rowCount: rows.length, uploadedById: ctx.userId } });
      const routes = new Map((await tx.route.findMany({ where: { routeType: meta.routeType as RouteType, prefix: { in: rows.map((r) => r.prefix) } } })).map((r) => [r.prefix, r]));
      for (const row of rows) {
        let route = routes.get(row.prefix);
        if (!route) {
          if (!canCreateRoutes) {
            result.errors.push({ line: row.line, message: `Unknown route ${row.prefix} — ask a route manager to add it` });
            continue;
          }
          route = await tx.route.create({ data: { prefix: row.prefix, destination: row.destination || row.prefix, routeType: meta.routeType } });
          routes.set(row.prefix, route);
          result.newRoutes++;
        }
        const from = row.effectiveFrom ?? meta.effectiveFrom;
        const r = await insertRate(tx, { routeId: route.id, accountId: account.id, ratePerMin: row.ratePerMin, currency: account.currency, effectiveFrom: from, createdById: ctx.userId, rateDeckId: deck.id });
        if (!r.changed) result.unchanged++;
        else if (r.previous == null) result.created++;
        else result.changed++;
        if (account.side === "CUSTOMER" && r.previous != null && row.ratePerMin > r.previous && from.getTime() < noticeCutoff) result.increasesWithoutNotice.push(`${route.destination} (${row.prefix})`);
      }
      await audit(tx, { actorId: ctx.userId, action: "ratedeck.import", entityType: "RateDeck", entityId: deck.id, after: { account: account.carrier.name, side: account.side, rows: rows.length, created: result.created, changed: result.changed, rejected: result.errors.length } });
    },
    { timeout: 120_000 },
  );
  return { ...result, errors: result.errors.slice(0, 50), errorCount: result.errors.length };
}

/** Current sell deck for a customer (CSV), or a vendor deck for buy-rate holders. */
export async function exportRateDeck(ctx: Ctx, raw: unknown): Promise<{ filename: string; csv: string }> {
  const { accountId } = z.object({ accountId: id }).parse(raw);
  const account = await db.carrierAccount.findFirst({ where: { AND: [{ id: accountId }, await accountWhere(ctx, "telecom.routes", "VIEW")] }, include: { carrier: { select: { name: true } } } });
  if (!account) throw new NotFoundError("Account");
  if (account.side === "VENDOR" && !canSeeBuy(ctx)) throw new ForbiddenError("telecom.buy_rates:VIEW");
  const now = new Date();
  const rates = await db.rate.findMany({
    where: { carrierAccountId: account.id, effectiveFrom: { lte: new Date(now.getTime() + 60 * 86_400_000) }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    include: { route: true },
    orderBy: [{ route: { destination: "asc" } }, { effectiveFrom: "asc" }],
  });
  const lines = [["Destination", "Prefix", "Type", `Rate per min (${account.currency})`, "Effective from", "Increments"].join(",")];
  for (const r of rates) lines.push([r.route.destination, r.route.prefix, r.route.routeType, Number(r.ratePerMin).toFixed(6), r.effectiveFrom.toISOString().slice(0, 10), `${account.incrementFirst}/${account.incrementNext}`].map(csvCell).join(","));
  await db.$transaction((tx) => audit(tx, { actorId: ctx.userId, action: "ratedeck.export", entityType: "CarrierAccount", entityId: account.id, after: { rows: rates.length, side: account.side } }));
  return { filename: `${account.carrier.name.replace(/[^A-Za-z0-9]+/g, "-")}-${account.side === "VENDOR" ? "buy" : "sell"}-rates-${now.toISOString().slice(0, 10)}.csv`, csv: lines.join("\n") };
}
