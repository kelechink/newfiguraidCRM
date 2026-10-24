import "server-only";
import type { Recurrence } from "@prisma/client";
import { z } from "zod";
import { round2 } from "@/domain/finance/money";
import { audit } from "@/server/audit/audit";
import { requireScope, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { notify } from "@/server/notify/notify";
import { getSetting } from "@/server/modules/settings/service";

const id = z.string().cuid();
const PER_MONTH: Record<Recurrence, number> = { WEEKLY: 52 / 12, MONTHLY: 1, QUARTERLY: 1 / 3, ANNUAL: 1 / 12 };
const UNUSED_DAYS = 60;

function subWhere(ctx: Ctx, action: "VIEW" | "CREATE" | "EDIT" | "DELETE") {
  const s = requireScope(ctx, "subscriptions", action);
  return s === "ALL" ? {} : s === "UNIT" ? { unitId: { in: ctx.unitIds } } : { ownerId: ctx.userId };
}

export async function listSubscriptions(ctx: Ctx) {
  const usd = Number(await getSetting("finance.usd_ngn_rate"));
  const rows = await db.subscription.findMany({ where: subWhere(ctx, "VIEW"), include: { owner: { select: { id: true, name: true } }, unit: { select: { code: true } } }, orderBy: [{ status: "asc" }, { renewalDate: "asc" }] });
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const now = Date.now();
  const items = rows.map((s) => {
    const monthly = Number(s.cost) * PER_MONTH[s.recurrence] * (s.currency === "NGN" ? 1 : usd);
    const days = Math.ceil((s.renewalDate.getTime() - now) / 86_400_000);
    const unused = s.status === "ACTIVE" && (s.lastUsedAt ? now - s.lastUsedAt.getTime() > UNUSED_DAYS * 86_400_000 : now - s.createdAt.getTime() > UNUSED_DAYS * 86_400_000);
    const duplicate = rows.some((o) => o.id !== s.id && o.status === "ACTIVE" && s.status === "ACTIVE" && (norm(o.name) === norm(s.name) || (o.category && o.category === s.category && norm(o.vendor) === norm(s.vendor))));
    return {
      id: s.id,
      name: s.name,
      vendor: s.vendor,
      category: s.category,
      unit: s.unit.code,
      unitId: s.unitId,
      owner: s.owner,
      cost: Number(s.cost),
      currency: s.currency,
      recurrence: s.recurrence,
      renewalDate: s.renewalDate.toISOString().slice(0, 10),
      daysToRenewal: days,
      cardLast4: s.cardLast4,
      seats: s.seats,
      status: s.status,
      lastUsedAt: s.lastUsedAt?.toISOString() ?? null,
      monthlyNgn: round2(monthly),
      flags: [...(unused ? ["unused"] : []), ...(duplicate ? ["duplicate"] : [])],
      notes: s.notes,
    };
  });
  const active = items.filter((i) => i.status === "ACTIVE" || i.status === "TRIAL");
  const monthly = round2(active.reduce((n, i) => n + i.monthlyNgn, 0));
  return { items, totals: { monthly, annual: round2(monthly * 12), dueIn30: active.filter((i) => i.daysToRenewal <= 30).length } };
}

const SubInput = z.object({
  id: id.optional(),
  name: z.string().trim().min(2).max(100),
  vendor: z.string().trim().min(2).max(100),
  category: z.string().trim().max(60).optional(),
  unitId: id,
  ownerId: id.nullable().default(null),
  cost: z.coerce.number().min(0).max(1e10),
  currency: z.enum(["NGN", "USD", "GBP", "EUR"]),
  recurrence: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]),
  renewalDate: z.coerce.date(),
  cardLast4: z.string().regex(/^\d{4}$/, "Last 4 digits only — never the full card number").optional().or(z.literal("")),
  seats: z.coerce.number().int().min(0).max(100000).nullable().optional(),
  status: z.enum(["ACTIVE", "TRIAL", "CANCELLED", "PAUSED"]).default("ACTIVE"),
  notes: z.string().trim().max(1000).optional(),
});

export async function saveSubscription(ctx: Ctx, raw: unknown) {
  const input = SubInput.parse(raw);
  const scope = requireScope(ctx, "subscriptions", input.id ? "EDIT" : "CREATE");
  if (scope !== "ALL" && !ctx.unitIds.includes(input.unitId)) throw new ForbiddenError("subscriptions unit");
  const data = { ...input, id: undefined, cardLast4: input.cardLast4 || null, category: input.category || null, notes: input.notes || null, seats: input.seats ?? null, remindedAt7: null, remindedAt1: null };
  await db.$transaction(async (tx) => {
    const before = input.id ? await tx.subscription.findFirst({ where: { AND: [{ id: input.id }, subWhere(ctx, "EDIT")] } }) : null;
    if (input.id && !before) throw new NotFoundError("Subscription");
    const s = input.id ? await tx.subscription.update({ where: { id: input.id }, data }) : await tx.subscription.create({ data });
    await audit(tx, { actorId: ctx.userId, action: input.id ? "subscription.update" : "subscription.create", entityType: "Subscription", entityId: s.id, unitId: s.unitId, before: before ? { cost: Number(before.cost), status: before.status } : undefined, after: { cost: input.cost, currency: input.currency, status: input.status } });
  });
}

export async function markSubscriptionUsed(ctx: Ctx, subscriptionId: string) {
  const s = await db.subscription.findFirst({ where: { AND: [{ id: subscriptionId }, subWhere(ctx, "EDIT")] } });
  if (!s) throw new NotFoundError("Subscription");
  await db.subscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } });
}

/** Daily job: reminders 7 days and 1 day before renewal to the owner and Finance (PRD Module F). */
export async function sendRenewalReminders(): Promise<number> {
  const now = Date.now();
  const due = await db.subscription.findMany({ where: { status: { in: ["ACTIVE", "TRIAL"] }, renewalDate: { gte: new Date(now), lte: new Date(now + 8 * 86_400_000) } } });
  const finance = await db.user.findMany({ where: { status: "ACTIVE", role: { key: "finance" } }, select: { id: true } });
  let sent = 0;
  for (const s of due) {
    const days = Math.ceil((s.renewalDate.getTime() - now) / 86_400_000);
    const which = days <= 1 && !s.remindedAt1 ? "1" : days <= 7 && !s.remindedAt7 ? "7" : null;
    if (!which) continue;
    await notify({
      userIds: [...(s.ownerId ? [s.ownerId] : []), ...finance.map((f) => f.id)],
      type: "subscription.renewal",
      title: `${s.name} renews ${which === "1" ? "tomorrow" : "in 7 days"}`,
      body: `${s.currency} ${Number(s.cost).toLocaleString("en-NG")} on card ••${s.cardLast4 ?? "??"}. Cancel now if it's no longer needed.`,
      link: "/money/subscriptions",
      email: true,
    });
    await db.subscription.update({ where: { id: s.id }, data: which === "1" ? { remindedAt1: new Date() } : { remindedAt7: new Date() } });
    sent++;
  }
  return sent;
}
