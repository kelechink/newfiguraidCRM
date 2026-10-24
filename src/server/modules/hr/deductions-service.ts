import "server-only";
import type { LatenessPolicy, Prisma } from "@prisma/client";
import { z } from "zod";
import { attendanceDeductions, workingDaysInMonth, type PolicyRule, type Tier } from "@/domain/hr/payroll";
import { audit } from "@/server/audit/audit";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { decryptOptional } from "@/server/crypto/field";
import { db } from "@/server/db";
import { notify } from "@/server/notify/notify";

const id = z.string().cuid();
const AUTO_TYPES: ("LATENESS" | "EARLY_DEPARTURE" | "ABSENCE")[] = ["LATENESS", "EARLY_DEPARTURE", "ABSENCE"];
export const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
type Tx = Prisma.TransactionClient;

export const monthBounds = (m: string) => {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1)) };
};

export function toRule(p: LatenessPolicy): PolicyRule {
  return {
    latenessMode: p.latenessMode,
    fixedAmount: p.fixedAmount != null ? Number(p.fixedAmount) : null,
    earlyLeaveAmount: p.earlyLeaveAmount != null ? Number(p.earlyLeaveAmount) : null,
    tiers: (p.tiers as Tier[] | null) ?? [],
    absenceMode: p.absenceMode,
    absenceAmount: p.absenceAmount != null ? Number(p.absenceAmount) : null,
    monthlyCapAmount: p.monthlyCapAmount != null ? Number(p.monthlyCapAmount) : null,
    monthlyCapPct: p.monthlyCapPct != null ? Number(p.monthlyCapPct) : null,
  };
}

/** Staff policy → their unit's → the company default, latest version in force for the month. */
export async function policyFor(tx: Tx, userId: string, m: string) {
  const { end } = monthBounds(m);
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { primaryUnitId: true, staffProfile: { select: { latenessPolicyId: true } } } });
  const pinned = u.staffProfile?.latenessPolicyId ? await tx.latenessPolicy.findUnique({ where: { id: u.staffProfile.latenessPolicyId } }) : null;
  if (pinned) return pinned;
  return (
    (u.primaryUnitId ? await tx.latenessPolicy.findFirst({ where: { unitId: u.primaryUnitId, effectiveFrom: { lt: end } }, orderBy: { effectiveFrom: "desc" } }) : null) ??
    (await tx.latenessPolicy.findFirst({ where: { unitId: null, effectiveFrom: { lt: end } }, orderBy: { effectiveFrom: "desc" } }))
  );
}

export function grossOf(p: { salaryEnc: string | null; allowancesEnc: string | null }) {
  const salary = Number(decryptOptional(p.salaryEnc) ?? 0);
  const allowances = JSON.parse(decryptOptional(p.allowancesEnc) ?? "[]") as { name: string; amount: number }[];
  return { salary, allowances, gross: salary + allowances.reduce((n, a) => n + a.amount, 0) };
}

/**
 * Rebuild a person's automatic lateness/absence deductions for a month from attendance.
 * Waived lines stay waived; lines already on a payslip are never touched.
 */
export async function recomputeDeductions(tx: Tx, userId: string, m: string) {
  const { start, end } = monthBounds(m);
  const profile = await tx.staffProfile.findUnique({ where: { userId } });
  const policy = await policyFor(tx, userId, m);
  const holidays = new Set((await tx.publicHoliday.findMany({ where: { date: { gte: start, lt: end } } })).map((h) => h.date.toISOString().slice(0, 10)));
  const working = workingDaysInMonth(m, profile?.workingDays ?? [1, 2, 3, 4, 5], holidays);
  const days = await tx.attendanceDay.findMany({ where: { userId, date: { gte: start, lt: end } }, include: { excuses: { where: { status: "APPROVED" }, select: { id: true } } } });
  const existing = await tx.deduction.findMany({ where: { userId, periodMonth: m, type: { in: AUTO_TYPES } } });
  if (existing.some((d) => d.payslipId)) return { items: existing, total: existing.reduce((n, d) => n + (d.status === "waived" ? 0 : Number(d.amount)), 0), locked: true };
  const waived = new Set(existing.filter((d) => d.status === "waived").map((d) => `${d.dayId}|${d.type}`));
  await tx.deduction.deleteMany({ where: { userId, periodMonth: m, type: { in: AUTO_TYPES }, status: { not: "waived" }, payslipId: null } });
  if (!policy) return { items: [], total: 0, locked: false };
  const gross = profile ? grossOf(profile).gross : 0;
  const result = attendanceDeductions({
    rule: toRule(policy),
    monthlyGross: gross,
    workingDaysInMonth: working.length,
    days: days.map((d) => ({ date: d.date.toISOString().slice(0, 10), dayId: d.id, status: d.status, minutesLate: d.minutesLate, minutesEarly: d.minutesEarly, excused: d.excuses.length > 0 })),
  });
  const lines = result.items.filter((i) => !waived.has(`${i.dayId}|${i.type}`));
  if (lines.length) await tx.deduction.createMany({ data: lines.map((l) => ({ userId, dayId: l.dayId ?? null, type: l.type, amount: l.amount, reason: l.reason, status: l.status, periodMonth: m })) });
  return { items: lines, total: lines.reduce((n, l) => n + l.amount, 0), locked: false };
}

// ── reading ──────────────────────────────────────────────────────────────────

/** Own deductions are always visible (self-service); others need hr.deductions VIEW at the right scope. */
export async function listDeductions(ctx: Ctx, raw: unknown) {
  const f = z.object({ userId: id.optional(), month }).parse(raw);
  const userId = f.userId ?? ctx.userId;
  if (userId !== ctx.userId) {
    const scope = requireScope(ctx, "hr.deductions", "VIEW");
    if (scope === "OWN") throw new ForbiddenError("hr.deductions:VIEW");
    if (scope === "UNIT" && !(await db.user.count({ where: { id: userId, OR: [{ primaryUnitId: { in: ctx.unitIds } }, { units: { some: { unitId: { in: ctx.unitIds } } } }] } }))) throw new NotFoundError("Staff member");
  }
  const paid = await db.deduction.count({ where: { userId, periodMonth: f.month, payslipId: { not: null } } });
  if (!paid) await db.$transaction((tx) => recomputeDeductions(tx, userId, f.month));
  const rows = await db.deduction.findMany({ where: { userId, periodMonth: f.month }, orderBy: { createdAt: "asc" }, include: { day: { select: { date: true } } } });
  return {
    month: f.month,
    final: paid > 0,
    total: rows.filter((r) => r.status !== "waived").reduce((n, r) => n + Number(r.amount), 0),
    rows: rows.map((r) => ({ id: r.id, type: r.type, amount: Number(r.amount), reason: r.reason, status: r.status, date: r.day?.date.toISOString().slice(0, 10) ?? null })),
  };
}

// ── HR actions ───────────────────────────────────────────────────────────────

export async function waiveDeduction(ctx: Ctx, raw: unknown) {
  const { deductionId, note } = z.object({ deductionId: id, note: z.string().trim().min(3).max(300) }).parse(raw);
  requireScope(ctx, "hr.deductions", "EDIT");
  const d = await db.deduction.findUnique({ where: { id: deductionId } });
  if (!d) throw new NotFoundError("Deduction");
  if (d.payslipId) throw new RuleError("Already paid — refund it as a bonus on the next payslip");
  if (d.userId === ctx.userId) throw new RuleError("Someone else must waive your own deduction");
  await db.$transaction(async (tx) => {
    await tx.deduction.update({ where: { id: d.id }, data: { status: "waived", reason: `${d.reason} — waived: ${note}` } });
    await audit(tx, { actorId: ctx.userId, action: "deduction.waive", entityType: "Deduction", entityId: d.id, after: { amount: Number(d.amount), note } });
  });
  await notify({ userIds: [d.userId], type: "deduction.waived", title: "A deduction was waived", body: d.reason, link: "/me" });
}

export async function addManualDeduction(ctx: Ctx, raw: unknown) {
  const input = z.object({ userId: id, month, type: z.enum(["ADVANCE_REPAYMENT", "OTHER"]), amount: z.coerce.number().positive().max(1e9), reason: z.string().trim().min(3).max(300) }).parse(raw);
  requireScope(ctx, "hr.deductions", "CREATE");
  if (input.userId === ctx.userId) throw new RuleError("Someone else must add deductions to your pay");
  if (await db.payslip.count({ where: { userId: input.userId, run: { periodMonth: input.month, status: { in: ["APPROVED", "SIGNED_OFF", "PAID"] } } } })) throw new RuleError("Payroll for that month is already approved");
  await db.$transaction(async (tx) => {
    const d = await tx.deduction.create({ data: { userId: input.userId, type: input.type, amount: input.amount, reason: input.reason, periodMonth: input.month } });
    await audit(tx, { actorId: ctx.userId, action: "deduction.add", entityType: "Deduction", entityId: d.id, after: { type: input.type, amount: input.amount, month: input.month } });
  });
  await notify({ userIds: [input.userId], type: "deduction.added", title: "A deduction was added to your pay", body: input.reason, link: "/me" });
}

// ── lateness policies ────────────────────────────────────────────────────────

export async function listPolicies(ctx: Ctx) {
  if (!can(ctx, "hr.deductions", "VIEW") && !can(ctx, "hr.staff", "VIEW")) throw new ForbiddenError("hr.deductions:VIEW");
  const rows = await db.latenessPolicy.findMany({ include: { unit: { select: { name: true } }, _count: { select: { staff: true } } }, orderBy: [{ unitId: "asc" }, { effectiveFrom: "desc" }] });
  return rows.map((p) => ({ id: p.id, name: p.name, unit: p.unit?.name ?? "All units", unitId: p.unitId, ...toRule(p), effectiveFrom: p.effectiveFrom.toISOString().slice(0, 10), documentVersion: p.documentVersion, pinnedStaff: p._count.staff }));
}

const PolicyInput = z.object({
  name: z.string().trim().min(2).max(80),
  unitId: id.nullable().default(null),
  latenessMode: z.enum(["FIXED", "TIERED"]),
  fixedAmount: z.coerce.number().min(0).max(1e7).nullable().default(null),
  earlyLeaveAmount: z.coerce.number().min(0).max(1e7).nullable().default(null),
  tiers: z.array(z.object({ fromMinutes: z.coerce.number().int().min(1).max(1440), toMinutes: z.coerce.number().int().min(1).max(1440).nullable(), amount: z.coerce.number().min(0).max(1e7) })).max(10).default([]),
  absenceMode: z.enum(["DAILY_RATE", "FIXED"]),
  absenceAmount: z.coerce.number().min(0).max(1e7).nullable().default(null),
  monthlyCapAmount: z.coerce.number().min(0).max(1e9).nullable().default(null),
  monthlyCapPct: z.coerce.number().min(0).max(100).nullable().default(null),
  effectiveFrom: z.coerce.date(),
  documentVersion: z.string().trim().max(40).optional(),
});

/** Policies are versioned: saving always adds a new version from its effective date. */
export async function savePolicy(ctx: Ctx, raw: unknown) {
  const input = PolicyInput.parse(raw);
  requireScope(ctx, "hr.deductions", "EDIT");
  if (input.latenessMode === "FIXED" && input.fixedAmount == null) throw new RuleError("Enter the amount per late day");
  if (input.latenessMode === "TIERED") {
    if (!input.tiers.length) throw new RuleError("Add at least one tier");
    const t = [...input.tiers].sort((a, b) => a.fromMinutes - b.fromMinutes);
    for (let i = 0; i < t.length; i++) {
      if (t[i]!.toMinutes != null && t[i]!.toMinutes! < t[i]!.fromMinutes) throw new RuleError("A tier ends before it starts");
      if (i > 0 && (t[i - 1]!.toMinutes == null || t[i - 1]!.toMinutes! >= t[i]!.fromMinutes)) throw new RuleError("Tiers overlap");
    }
  }
  if (input.absenceMode === "FIXED" && input.absenceAmount == null) throw new RuleError("Enter the absence amount");
  await db.$transaction(async (tx) => {
    const p = await tx.latenessPolicy.create({ data: { ...input, documentVersion: input.documentVersion || null, tiers: input.latenessMode === "TIERED" ? input.tiers : undefined } });
    await audit(tx, { actorId: ctx.userId, action: "lateness_policy.create", entityType: "LatenessPolicy", entityId: p.id, after: { name: p.name, unitId: p.unitId, mode: p.latenessMode, from: input.effectiveFrom.toISOString().slice(0, 10) } });
  });
}
