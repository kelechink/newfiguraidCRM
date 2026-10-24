import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { payslip, proRataFraction, workingDaysInMonth, type Breakdown } from "@/domain/hr/payroll";
import { localDate } from "@/domain/sop/schedule";
import { audit } from "@/server/audit/audit";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { requireRecentAuth } from "@/server/auth/session";
import { decryptJson, decryptOptional, encryptJson, encryptOptional, maskTail } from "@/server/crypto/field";
import { db } from "@/server/db";
import { notify } from "@/server/notify/notify";
import { payslipPdf } from "@/server/pdf/payslip";
import { getSetting } from "@/server/modules/settings/service";
import { csvCell } from "@/domain/telecom/rating";
import { grossOf, month, monthBounds, recomputeDeductions } from "./deductions-service";

const id = z.string().cuid();
type Tx = Prisma.TransactionClient;

interface Adjustments {
  bonuses: { name: string; amount: number }[];
  other: { name: string; amount: number }[];
}
interface Stored {
  adjustments: Adjustments;
  breakdown: Breakdown;
  deductionLines: { reason: string; amount: number }[];
}

async function statutory() {
  return { payeEnabled: Number(await getSetting("payroll.paye_enabled")) === 1, pensionPct: Number(await getSetting("payroll.pension_pct")), nhfPct: Number(await getSetting("payroll.nhf_pct")) };
}

/** Compute one person's payslip for the month from profile, attendance deductions and run adjustments. */
async function buildSlip(tx: Tx, userId: string, m: string, adjustments: Adjustments, stat: Awaited<ReturnType<typeof statutory>>): Promise<Stored | null> {
  const profile = await tx.staffProfile.findUnique({ where: { userId } });
  if (!profile?.salaryEnc) return null;
  const { start, end } = monthBounds(m);
  const holidays = new Set((await tx.publicHoliday.findMany({ where: { date: { gte: start, lt: end } } })).map((h) => h.date.toISOString().slice(0, 10)));
  const working = workingDaysInMonth(m, profile.workingDays, holidays);
  const exit = await tx.exitCase.findFirst({ where: { userId, lastWorkingDay: { gte: start, lt: end } }, orderBy: { createdAt: "desc" } });
  const startDay = profile.startDate.toISOString().slice(0, 10);
  const fraction = proRataFraction(working, startDay >= start.toISOString().slice(0, 10) ? startDay : null, exit ? exit.lastWorkingDay.toISOString().slice(0, 10) : null);
  if (fraction === 0) return null;
  await recomputeDeductions(tx, userId, m);
  const lines = await tx.deduction.findMany({ where: { userId, periodMonth: m, status: { not: "waived" }, payslipId: null } });
  const attendance = lines.filter((l) => l.type === "LATENESS" || l.type === "ABSENCE");
  const manual = lines.filter((l) => l.type === "ADVANCE_REPAYMENT" || l.type === "OTHER");
  const { salary, allowances } = grossOf(profile);
  const breakdown = payslip({
    base: salary,
    allowances,
    bonuses: adjustments.bonuses,
    attendance: attendance.reduce((n, l) => n + Number(l.amount), 0),
    other: [...manual.map((l) => ({ name: l.type === "ADVANCE_REPAYMENT" ? `Advance repayment — ${l.reason}` : l.reason, amount: Number(l.amount) })), ...adjustments.other],
    statutory: stat,
    proRata: fraction,
  });
  return { adjustments, breakdown, deductionLines: attendance.filter((l) => Number(l.amount) > 0).map((l) => ({ reason: l.reason, amount: Number(l.amount) })) };
}

async function refreshTotals(tx: Tx, runId: string) {
  const slips = await tx.payslip.findMany({ where: { runId } });
  let gross = 0;
  let net = 0;
  for (const s of slips) {
    const b = decryptJson<Stored>(s.breakdownEnc).breakdown;
    gross += b.gross;
    net += b.net;
  }
  await tx.payrollRun.update({ where: { id: runId }, data: { staffCount: slips.length, totalGrossEnc: encryptOptional(gross.toFixed(2)), totalNetEnc: encryptOptional(net.toFixed(2)) } });
  return { gross, net };
}

// ── lifecycle ────────────────────────────────────────────────────────────────

export async function createRun(ctx: Ctx, raw: unknown): Promise<{ id: string }> {
  const { periodMonth } = z.object({ periodMonth: month }).parse(raw);
  requireScope(ctx, "payroll", "CREATE");
  if (periodMonth > localDate(new Date()).slice(0, 7)) throw new RuleError("You can't run payroll for a future month");
  const { start, end } = monthBounds(periodMonth);
  const stat = await statutory();
  const existing = await db.payrollRun.findUnique({ where: { periodMonth } });
  if (existing && existing.status !== "CANCELLED") throw new RuleError(`There's already a ${existing.status.toLowerCase().replace("_", " ")} run for ${periodMonth}`);
  return db.$transaction(
    async (tx) => {
      if (existing) await tx.payrollRun.delete({ where: { id: existing.id } });
      const run = await tx.payrollRun.create({ data: { periodMonth, preparedById: ctx.userId } });
      const people = await tx.user.findMany({
        where: { staffProfile: { salaryEnc: { not: null }, startDate: { lt: end } }, OR: [{ status: { in: ["ACTIVE", "SUSPENDED"] } }, { status: "EXITED", exitCases: { some: { lastWorkingDay: { gte: start } } } }] },
        select: { id: true },
      });
      for (const p of people) {
        const slip = await buildSlip(tx, p.id, periodMonth, { bonuses: [], other: [] }, stat);
        if (slip) await tx.payslip.create({ data: { runId: run.id, userId: p.id, breakdownEnc: encryptJson(slip), netPayEnc: encryptOptional(slip.breakdown.net.toFixed(2))! } });
      }
      const totals = await refreshTotals(tx, run.id);
      await audit(tx, { actorId: ctx.userId, action: "payroll.create", entityType: "PayrollRun", entityId: run.id, after: { month: periodMonth, staff: people.length } }); // never the totals
      void totals;
      return { id: run.id };
    },
    { timeout: 120_000 },
  );
}

const AdjustInput = z.object({
  payslipId: id,
  bonuses: z.array(z.object({ name: z.string().trim().min(1).max(60), amount: z.coerce.number().min(0).max(1e9) })).max(10),
  other: z.array(z.object({ name: z.string().trim().min(1).max(60), amount: z.coerce.number().min(0).max(1e9) })).max(10),
});

/** Bonuses and one-off deductions on a draft run; recomputes the slip. */
export async function adjustPayslip(ctx: Ctx, raw: unknown) {
  const input = AdjustInput.parse(raw);
  requireScope(ctx, "payroll", "EDIT");
  const s = await db.payslip.findUnique({ where: { id: input.payslipId }, include: { run: true } });
  if (!s) throw new NotFoundError("Payslip");
  if (s.run.status !== "DRAFT") throw new RuleError("Only draft runs can be adjusted — send it back to draft first");
  if (s.userId === ctx.userId) throw new RuleError("Someone else must adjust your own payslip");
  const stat = await statutory();
  await db.$transaction(async (tx) => {
    const slip = await buildSlip(tx, s.userId, s.run.periodMonth, { bonuses: input.bonuses, other: input.other }, stat);
    if (!slip) throw new RuleError("This person has no pay set for the month");
    await tx.payslip.update({ where: { id: s.id }, data: { breakdownEnc: encryptJson(slip), netPayEnc: encryptOptional(slip.breakdown.net.toFixed(2))! } });
    await refreshTotals(tx, s.runId);
    await audit(tx, { actorId: ctx.userId, action: "payroll.adjust", entityType: "Payslip", entityId: s.id, after: { bonuses: input.bonuses.length, other: input.other.length } });
  });
}

/** Rebuild every slip in a draft run (after attendance or excuse changes). */
export async function recalculateRun(ctx: Ctx, runId: string) {
  requireScope(ctx, "payroll", "EDIT");
  const run = await db.payrollRun.findUnique({ where: { id: runId }, include: { payslips: true } });
  if (!run) throw new NotFoundError("Payroll run");
  if (run.status !== "DRAFT") throw new RuleError("Only draft runs can be recalculated");
  const stat = await statutory();
  await db.$transaction(
    async (tx) => {
      for (const s of run.payslips) {
        const prev = decryptJson<Stored>(s.breakdownEnc);
        const slip = await buildSlip(tx, s.userId, run.periodMonth, prev.adjustments, stat);
        if (slip) await tx.payslip.update({ where: { id: s.id }, data: { breakdownEnc: encryptJson(slip), netPayEnc: encryptOptional(slip.breakdown.net.toFixed(2))! } });
        else await tx.payslip.delete({ where: { id: s.id } });
      }
      await refreshTotals(tx, run.id);
      await audit(tx, { actorId: ctx.userId, action: "payroll.recalculate", entityType: "PayrollRun", entityId: run.id });
    },
    { timeout: 120_000 },
  );
}

type Transition = "submit" | "reopen" | "approve" | "signoff" | "paid" | "cancel";

/**
 * Draft → review (preparer) → approved (a different approver) → signed off by the
 * Super Admin when net pay exceeds the limit → paid. Money steps need a fresh password.
 */
export async function transitionRun(ctx: Ctx, raw: unknown) {
  const { runId, to } = z.object({ runId: id, to: z.enum(["submit", "reopen", "approve", "signoff", "paid", "cancel"]) }).parse(raw);
  const run = await db.payrollRun.findUnique({ where: { id: runId } });
  if (!run) throw new NotFoundError("Payroll run");
  const limit = Number(await getSetting("payroll.signoff_limit_ngn"));
  const net = Number(decryptOptional(run.totalNetEnc) ?? 0);
  const needsSignoff = net > limit;
  const rules: Record<Transition, { from: string[]; status: Prisma.PayrollRunUpdateInput["status"]; check: () => void | Promise<void> }> = {
    submit: { from: ["DRAFT"], status: "IN_REVIEW", check: () => void requireScope(ctx, "payroll", "EDIT") },
    reopen: { from: ["IN_REVIEW", "APPROVED"], status: "DRAFT", check: () => void requireScope(ctx, "payroll", "EDIT") },
    cancel: { from: ["DRAFT", "IN_REVIEW"], status: "CANCELLED", check: () => void requireScope(ctx, "payroll", "EDIT") },
    approve: {
      from: ["IN_REVIEW"],
      status: "APPROVED",
      check: async () => {
        requireScope(ctx, "payroll", "APPROVE");
        if (run.preparedById === ctx.userId) throw new RuleError("The person who prepared payroll can't approve it");
        await requireRecentAuth(ctx);
      },
    },
    signoff: {
      from: ["APPROVED"],
      status: "SIGNED_OFF",
      check: async () => {
        if (!can(ctx, "payroll.signoff", "APPROVE")) throw new ForbiddenError("payroll.signoff:APPROVE");
        if (!needsSignoff) throw new RuleError("This run is under the sign-off limit — it can be paid directly");
        if (run.preparedById === ctx.userId) throw new RuleError("The person who prepared payroll can't sign it off");
        await requireRecentAuth(ctx);
      },
    },
    paid: {
      from: ["APPROVED", "SIGNED_OFF"],
      status: "PAID",
      check: async () => {
        requireScope(ctx, "payroll", "APPROVE");
        if (run.status === "APPROVED" && needsSignoff) throw new RuleError("Net pay is above the sign-off limit — the Super Admin must sign it off first");
        await requireRecentAuth(ctx);
      },
    },
  };
  const rule = rules[to];
  if (!rule.from.includes(run.status)) throw new RuleError(`A ${run.status.toLowerCase().replace("_", " ")} run can't do that`);
  await rule.check();
  const { start, end } = monthBounds(run.periodMonth);
  const slips = to === "paid" || to === "approve" ? await db.payslip.findMany({ where: { runId: run.id }, select: { id: true, userId: true } }) : [];
  await db.$transaction(
    async (tx) => {
      await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: rule.status,
          ...(to === "approve" ? { approvedById: ctx.userId, approvedAt: new Date() } : {}),
          ...(to === "signoff" ? { signedOffById: ctx.userId, signedOffAt: new Date() } : {}),
          ...(to === "paid" ? { paidAt: new Date() } : {}),
          ...(to === "reopen" ? { approvedById: null, approvedAt: null } : {}),
        },
      });
      if (to === "paid") {
        // freeze the month: attendance can't change and deductions are tied to the slip
        const ids = slips.map((s) => s.userId);
        await tx.attendanceDay.updateMany({ where: { userId: { in: ids }, date: { gte: start, lt: end } }, data: { payrollLockedAt: new Date() } });
        for (const s of slips) await tx.deduction.updateMany({ where: { userId: s.userId, periodMonth: run.periodMonth, payslipId: null }, data: { payslipId: s.id } });
      }
      await audit(tx, { actorId: ctx.userId, action: `payroll.${to}`, entityType: "PayrollRun", entityId: run.id, before: { status: run.status }, after: { status: rule.status, needsSignoff } });
    },
    { timeout: 60_000 },
  );
  if (to === "approve" && needsSignoff) {
    const supers = await db.user.findMany({ where: { status: "ACTIVE", role: { key: "super_admin" } }, select: { id: true } });
    await notify({ userIds: supers.map((s) => s.id), type: "payroll.signoff", title: `Payroll for ${run.periodMonth} needs your sign-off`, body: "Net pay is above the sign-off limit.", link: `/team/payroll/${run.id}`, email: true });
  }
  if (to === "paid") await notify({ userIds: slips.map((s) => s.userId), type: "payroll.paid", title: `Your payslip for ${run.periodMonth} is ready`, body: "Open Figuraid OS to view or download it.", link: "/me", email: true });
}

// ── reading ──────────────────────────────────────────────────────────────────

export async function listRuns(ctx: Ctx) {
  requireScope(ctx, "payroll", "VIEW");
  const runs = await db.payrollRun.findMany({ orderBy: { periodMonth: "desc" }, take: 24, include: { preparedBy: { select: { name: true } }, approvedBy: { select: { name: true } }, signedOffBy: { select: { name: true } } } });
  const limit = Number(await getSetting("payroll.signoff_limit_ngn"));
  return runs.map((r) => {
    const net = Number(decryptOptional(r.totalNetEnc) ?? 0);
    return { id: r.id, periodMonth: r.periodMonth, status: r.status, staffCount: r.staffCount, gross: Number(decryptOptional(r.totalGrossEnc) ?? 0), net, needsSignoff: net > limit, preparedBy: r.preparedBy.name, approvedBy: r.approvedBy?.name ?? null, signedOffBy: r.signedOffBy?.name ?? null, paidAt: r.paidAt?.toISOString() ?? null };
  });
}

export async function getRun(ctx: Ctx, runId: string) {
  requireScope(ctx, "payroll", "VIEW");
  const run = await db.payrollRun.findUnique({ where: { id: runId }, include: { preparedBy: { select: { id: true, name: true } }, approvedBy: { select: { name: true } }, signedOffBy: { select: { name: true } }, payslips: { include: { user: { select: { id: true, name: true, staffProfile: { select: { employeeNo: true, jobTitle: true } }, primaryUnit: { select: { code: true } } } } } } } });
  if (!run) throw new NotFoundError("Payroll run");
  await db.$transaction((tx) => audit(tx, { actorId: ctx.userId, action: "payroll.view", entityType: "PayrollRun", entityId: run.id }));
  const limit = Number(await getSetting("payroll.signoff_limit_ngn"));
  const rows = run.payslips
    .map((s) => {
      const st = decryptJson<Stored>(s.breakdownEnc);
      return { id: s.id, userId: s.user.id, name: s.user.name, employeeNo: s.user.staffProfile?.employeeNo ?? "", jobTitle: s.user.staffProfile?.jobTitle ?? "", unit: s.user.primaryUnit?.code ?? null, ...st };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const total = (k: "gross" | "net" | "totalDeductions") => rows.reduce((n, r) => n + r.breakdown[k], 0);
  const net = total("net");
  return {
    id: run.id,
    periodMonth: run.periodMonth,
    status: run.status,
    preparedBy: run.preparedBy,
    approvedBy: run.approvedBy?.name ?? null,
    signedOffBy: run.signedOffBy?.name ?? null,
    paidAt: run.paidAt?.toISOString() ?? null,
    totals: { gross: total("gross"), deductions: total("totalDeductions"), net, attendance: rows.reduce((n, r) => n + (r.breakdown.deductions.find((d) => d.name === "Lateness & absence")?.amount ?? 0), 0) },
    limit,
    needsSignoff: net > limit,
    rows,
  };
}

/** The staff member's own payslips (paid runs only). */
export async function myPayslips(ctx: Ctx) {
  const slips = await db.payslip.findMany({ where: { userId: ctx.userId, run: { status: "PAID" } }, include: { run: { select: { periodMonth: true, paidAt: true } } }, orderBy: { run: { periodMonth: "desc" } }, take: 24 });
  return slips.map((s) => {
    const b = decryptJson<Stored>(s.breakdownEnc).breakdown;
    return { id: s.id, month: s.run.periodMonth, paidAt: s.run.paidAt?.toISOString() ?? null, gross: b.gross, net: b.net, deductions: b.totalDeductions };
  });
}

export async function renderPayslip(ctx: Ctx, payslipId: string): Promise<{ filename: string; base64: string }> {
  const s = await db.payslip.findUnique({ where: { id: payslipId }, include: { run: true, user: { include: { staffProfile: true, primaryUnit: { select: { name: true } } } } } });
  if (!s) throw new NotFoundError("Payslip");
  const own = s.userId === ctx.userId;
  if (own ? s.run.status !== "PAID" : !can(ctx, "payroll", "VIEW")) throw new NotFoundError("Payslip");
  const st = decryptJson<Stored>(s.breakdownEnc);
  const p = s.user.staffProfile;
  const acct = decryptOptional(p?.bankAccountEnc);
  const bytes = await payslipPdf({ name: s.user.name, employeeNo: p?.employeeNo ?? "", jobTitle: p?.jobTitle ?? "", unit: s.user.primaryUnit?.name ?? "Figuraid", month: s.run.periodMonth, bank: acct ? `${decryptOptional(p?.bankNameEnc) ?? ""} ${maskTail(acct)}` : null, breakdown: st.breakdown, deductionLines: st.deductionLines });
  await db.$transaction((tx) => audit(tx, { actorId: ctx.userId, action: "payslip.download", entityType: "Payslip", entityId: s.id, after: { own } }));
  return { filename: `payslip-${p?.employeeNo ?? "staff"}-${s.run.periodMonth}.pdf`, base64: Buffer.from(bytes).toString("base64") };
}

/** Bank payment schedule for an approved run: full account numbers, so export rights + fresh password + audit. */
export async function exportBankSchedule(ctx: Ctx, runId: string): Promise<{ filename: string; csv: string }> {
  requireScope(ctx, "payroll", "EXPORT");
  if (!can(ctx, "exports", "CREATE") || !can(ctx, "hr.bank_details", "VIEW")) throw new ForbiddenError("exports:CREATE");
  const run = await db.payrollRun.findUnique({ where: { id: runId }, include: { payslips: { include: { user: { include: { staffProfile: true } } } } } });
  if (!run) throw new NotFoundError("Payroll run");
  if (!["APPROVED", "SIGNED_OFF", "PAID"].includes(run.status)) throw new RuleError("Approve the run first");
  const limit = Number(await getSetting("payroll.signoff_limit_ngn"));
  if (run.status === "APPROVED" && Number(decryptOptional(run.totalNetEnc) ?? 0) > limit) throw new RuleError("Awaiting Super Admin sign-off");
  await requireRecentAuth(ctx);
  const lines = [`# Figuraid payroll ${run.periodMonth} — exported by ${ctx.name} on ${new Date().toISOString()} — CONFIDENTIAL`, ["Employee no", "Name", "Bank", "Account name", "Account number", "Net pay (NGN)"].join(",")];
  for (const s of run.payslips) {
    const p = s.user.staffProfile;
    lines.push([p?.employeeNo, s.user.name, decryptOptional(p?.bankNameEnc), decryptOptional(p?.accountNameEnc), decryptOptional(p?.bankAccountEnc), decryptOptional(s.netPayEnc)].map(csvCell).join(","));
  }
  await db.$transaction((tx) => audit(tx, { actorId: ctx.userId, action: "export.payroll_bank", entityType: "PayrollRun", entityId: run.id, after: { rows: run.payslips.length } }));
  return { filename: `payroll-${run.periodMonth}-bank-schedule.csv`, csv: lines.join("\n") };
}
