import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { round2 } from "@/domain/finance/money";
import { audit } from "@/server/audit/audit";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { requireRecentAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { appUrl } from "@/server/email/send";
import { notify } from "@/server/notify/notify";

const id = z.string().cuid();
const ALPHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const newCode = () => Array.from({ length: 7 }, () => ALPHA[randomInt(ALPHA.length)]).join("");

export async function listReferrers(ctx: Ctx) {
  requireScope(ctx, "referrals", "VIEW");
  const rows = await db.referrer.findMany({ include: { referrals: { select: { status: true, commissionAmount: true, payoutId: true } }, contact: { select: { id: true, displayName: true } } }, orderBy: { createdAt: "desc" } });
  return rows.map((r) => {
    const won = r.referrals.filter((x) => x.status === "won" || x.status === "paid");
    const owed = r.referrals.filter((x) => x.status === "won" && !x.payoutId);
    return { id: r.id, name: r.name, type: r.type, code: r.code, link: appUrl(`/r/${r.code}`), status: r.status, contact: r.contact, referred: r.referrals.length, won: won.length, earned: round2(won.reduce((n, x) => n + Number(x.commissionAmount ?? 0), 0)), owed: round2(owed.reduce((n, x) => n + Number(x.commissionAmount ?? 0), 0)) };
  });
}

export async function createReferrer(ctx: Ctx, raw: unknown) {
  const input = z.object({ type: z.enum(["CUSTOMER", "GRADUATE", "PARTNER"]), name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")), contactId: id.nullable().default(null) }).parse(raw);
  requireScope(ctx, "referrals", "CREATE");
  let code = newCode();
  while (await db.referrer.findUnique({ where: { code } })) code = newCode();
  await db.referrer.create({ data: { ...input, email: input.email || null, code } });
}

export async function listReferrals(ctx: Ctx) {
  requireScope(ctx, "referrals", "VIEW");
  const rows = await db.referral.findMany({ include: { referrer: { select: { name: true } }, contact: { select: { id: true, displayName: true } }, deal: { select: { title: true, value: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
  return rows.map((r) => ({ id: r.id, referrer: r.referrer.name, contact: r.contact, deal: r.deal ? { title: r.deal.title, value: Number(r.deal.value ?? 0) } : null, status: r.status, commission: r.commissionAmount != null ? Number(r.commissionAmount) : null, createdAt: r.createdAt.toISOString() }));
}

/** Bundle a referrer's won, unpaid commissions into a payout request. */
export async function requestPayout(ctx: Ctx, referrerId: string) {
  if (!can(ctx, "referrals", "EDIT") && !can(ctx, "referrals.payouts", "CREATE")) throw new ForbiddenError("referrals:EDIT");
  const owed = await db.referral.findMany({ where: { referrerId, status: "won", payoutId: null, commissionAmount: { gt: 0 } } });
  if (!owed.length) throw new RuleError("Nothing is owed to this referrer");
  const amount = round2(owed.reduce((n, r) => n + Number(r.commissionAmount), 0));
  await db.$transaction(async (tx) => {
    const p = await tx.referralPayout.create({ data: { referrerId, amount } });
    await tx.referral.updateMany({ where: { id: { in: owed.map((o) => o.id) } }, data: { payoutId: p.id } });
    await audit(tx, { actorId: ctx.userId, action: "referral_payout.request", entityType: "ReferralPayout", entityId: p.id, after: { amount, referrals: owed.length } });
  });
  const approvers = await db.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["finance", "super_admin"] } } }, select: { id: true } });
  await notify({ userIds: approvers.map((a) => a.id), type: "referral.payout", title: `Referral payout of ₦${amount.toLocaleString("en-NG")} to approve`, link: "/customers/referrals" });
}

export async function listPayouts(ctx: Ctx) {
  if (!can(ctx, "referrals.payouts", "VIEW") && !can(ctx, "referrals", "VIEW")) throw new ForbiddenError("referrals.payouts:VIEW");
  const rows = await db.referralPayout.findMany({ include: { referrer: { select: { name: true } }, approvedBy: { select: { name: true } }, _count: { select: { referrals: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return rows.map((p) => ({ id: p.id, referrer: p.referrer.name, amount: Number(p.amount), currency: p.currency, status: p.status, referrals: p._count.referrals, approvedBy: p.approvedBy?.name ?? null, createdAt: p.createdAt.toISOString(), expenseId: p.expenseId }));
}

/** Approving a payout records it as an approved expense in finance (unit of the referred deals). */
export async function decidePayout(ctx: Ctx, raw: unknown) {
  const { payoutId, approve } = z.object({ payoutId: id, approve: z.boolean() }).parse(raw);
  requireScope(ctx, "referrals.payouts", "APPROVE");
  const p = await db.referralPayout.findUnique({ where: { id: payoutId }, include: { referrer: true, referrals: { include: { deal: { select: { unitId: true } } } } } });
  if (!p) throw new NotFoundError("Payout");
  if (p.status !== "PENDING") throw new RuleError("Already decided");
  const requested = await db.auditLog.findFirst({ where: { action: "referral_payout.request", entityId: p.id }, select: { actorId: true } });
  if (approve && requested?.actorId === ctx.userId) throw new RuleError("Someone other than the requester must approve this payout");
  await requireRecentAuth(ctx);
  await db.$transaction(async (tx) => {
    if (!approve) {
      await tx.referralPayout.update({ where: { id: p.id }, data: { status: "REJECTED", approvedById: ctx.userId, approvedAt: new Date() } });
      await tx.referral.updateMany({ where: { payoutId: p.id }, data: { payoutId: null } });
    } else {
      const category = await tx.expenseCategory.upsert({ where: { name: "Referral commission" }, update: {}, create: { name: "Referral commission" } });
      const unitId = p.referrals.find((r) => r.deal?.unitId)?.deal?.unitId ?? (await tx.businessUnit.findUniqueOrThrow({ where: { code: "HQ" } })).id;
      const e = await tx.expense.create({ data: { unitId, categoryId: category.id, description: `Referral commission — ${p.referrer.name} (${p.referrals.length} referral${p.referrals.length === 1 ? "" : "s"})`, vendor: p.referrer.name, amount: p.amount, currency: p.currency, amountNgn: p.amount, incurredOn: new Date(), status: "APPROVED", submittedById: ctx.userId, approvedById: ctx.userId, approvedAt: new Date() } });
      await tx.referralPayout.update({ where: { id: p.id }, data: { status: "APPROVED", approvedById: ctx.userId, approvedAt: new Date(), expenseId: e.id } });
      await tx.referral.updateMany({ where: { payoutId: p.id }, data: { status: "paid" } });
    }
    await audit(tx, { actorId: ctx.userId, action: approve ? "referral_payout.approve" : "referral_payout.reject", entityType: "ReferralPayout", entityId: p.id, after: { amount: Number(p.amount) } });
  });
}

/** /r/CODE: remember the referrer for the lead forms (code only — no personal data in the cookie). */
export async function referrerForCode(code: string) {
  if (!/^[2-9A-HJKMNP-Z]{7}$/.test(code)) return null;
  return db.referrer.findFirst({ where: { code, status: "active" }, select: { code: true } });
}
