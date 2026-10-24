import "server-only";
import { z } from "zod";
import { payslip, proRataFraction, workingDaysInMonth } from "@/domain/hr/payroll";
import { audit } from "@/server/audit/audit";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { requireRecentAuth } from "@/server/auth/session";
import { decryptOptional, encryptOptional } from "@/server/crypto/field";
import { db } from "@/server/db";
import { notify } from "@/server/notify/notify";
import { getSetting } from "@/server/modules/settings/service";
import { grossOf, monthBounds } from "./deductions-service";

const id = z.string().cuid();
type Item = { item: string; done: boolean; by: string | null; at: string | null };

const CHECKLIST = [
  "Company laptop and accessories returned",
  "Phone, SIM and access cards returned",
  "Work handed over and documented",
  "Client and carrier accounts reassigned",
  "Passwords and shared credentials rotated",
  "Exit interview held",
  "Final pay agreed",
];

export async function listExits(ctx: Ctx) {
  requireScope(ctx, "hr.staff", "VIEW");
  const rows = await db.exitCase.findMany({ include: { user: { select: { id: true, name: true, status: true } }, handledBy: { select: { name: true } } }, orderBy: [{ status: "asc" }, { lastWorkingDay: "desc" }], take: 100 });
  return rows.map((e) => ({ id: e.id, user: e.user, type: e.type, noticeDate: e.noticeDate.toISOString().slice(0, 10), lastWorkingDay: e.lastWorkingDay.toISOString().slice(0, 10), status: e.status, done: (e.handoverChecklist as Item[]).filter((i) => i.done).length, total: (e.handoverChecklist as Item[]).length, accessRevokedAt: e.accessRevokedAt?.toISOString() ?? null, handledBy: e.handledBy.name }));
}

export async function getExit(ctx: Ctx, userId: string) {
  requireScope(ctx, "hr.staff", "VIEW");
  const e = await db.exitCase.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, include: { handledBy: { select: { name: true } } } });
  if (!e) return null;
  const seePay = can(ctx, "hr.salaries", "VIEW");
  return {
    id: e.id,
    type: e.type,
    noticeDate: e.noticeDate.toISOString().slice(0, 10),
    lastWorkingDay: e.lastWorkingDay.toISOString().slice(0, 10),
    reason: e.reason,
    checklist: e.handoverChecklist as Item[],
    finalPay: seePay && e.finalPayEnc ? (JSON.parse(decryptOptional(e.finalPayEnc)!) as { gross: number; net: number; notes: string[] }) : null,
    accessRevokedAt: e.accessRevokedAt?.toISOString() ?? null,
    status: e.status,
    handledBy: e.handledBy.name,
  };
}

export async function openExit(ctx: Ctx, raw: unknown) {
  const input = z.object({ userId: id, type: z.enum(["RESIGNATION", "TERMINATION", "END_OF_CONTRACT"]), noticeDate: z.coerce.date(), lastWorkingDay: z.coerce.date(), reason: z.string().trim().max(2000).optional() }).parse(raw);
  requireScope(ctx, "hr.staff", "EDIT");
  if (input.userId === ctx.userId) throw new RuleError("You can't process your own exit");
  if (input.lastWorkingDay < input.noticeDate) throw new RuleError("The last working day is before the notice date");
  const u = await db.user.findUnique({ where: { id: input.userId }, include: { role: { select: { key: true } } } });
  if (!u) throw new NotFoundError("Staff member");
  if (u.role.key === "super_admin" && !can(ctx, "roles", "EDIT")) throw new RuleError("Only a Super Admin can process another Super Admin's exit");
  if (await db.exitCase.count({ where: { userId: u.id, status: { not: "closed" } } })) throw new RuleError("An exit is already open for this person");
  await db.$transaction(async (tx) => {
    const e = await tx.exitCase.create({ data: { ...input, reason: input.reason || null, handledById: ctx.userId, handoverChecklist: CHECKLIST.map((item) => ({ item, done: false, by: null, at: null })) } });
    await audit(tx, { actorId: ctx.userId, action: "exit.open", entityType: "ExitCase", entityId: e.id, after: { user: u.id, type: input.type, lastWorkingDay: input.lastWorkingDay.toISOString().slice(0, 10) } });
  });
}

export async function toggleExitItem(ctx: Ctx, raw: unknown) {
  const { exitId, index, done } = z.object({ exitId: id, index: z.number().int().min(0).max(50), done: z.boolean() }).parse(raw);
  requireScope(ctx, "hr.staff", "EDIT");
  const e = await db.exitCase.findUnique({ where: { id: exitId } });
  if (!e) throw new NotFoundError("Exit");
  if (e.status === "closed") throw new RuleError("This exit is closed");
  const list = e.handoverChecklist as Item[];
  if (!list[index]) throw new NotFoundError("Checklist item");
  list[index] = { ...list[index]!, done, by: done ? ctx.name : null, at: done ? new Date().toISOString() : null };
  await db.exitCase.update({ where: { id: e.id }, data: { handoverChecklist: list } });
}

/** Pro-rata pay for the final month, less outstanding advances. Encrypted; payroll picks the pro-rata up automatically. */
export async function computeFinalPay(ctx: Ctx, exitId: string) {
  requireScope(ctx, "hr.staff", "EDIT");
  if (!can(ctx, "hr.salaries", "VIEW")) throw new RuleError("You need salary access to compute final pay");
  const e = await db.exitCase.findUnique({ where: { id: exitId } });
  if (!e) throw new NotFoundError("Exit");
  const p = await db.staffProfile.findUnique({ where: { userId: e.userId } });
  if (!p?.salaryEnc) throw new RuleError("No salary on file");
  const m = e.lastWorkingDay.toISOString().slice(0, 7);
  const { start, end } = monthBounds(m);
  const holidays = new Set((await db.publicHoliday.findMany({ where: { date: { gte: start, lt: end } } })).map((h) => h.date.toISOString().slice(0, 10)));
  const working = workingDaysInMonth(m, p.workingDays, holidays);
  const fraction = proRataFraction(working, null, e.lastWorkingDay.toISOString().slice(0, 10));
  const { salary, allowances } = grossOf(p);
  const advances = await db.deduction.findMany({ where: { userId: e.userId, type: "ADVANCE_REPAYMENT", payslipId: null, status: "active" } });
  const b = payslip({
    base: salary,
    allowances,
    bonuses: [],
    attendance: 0,
    other: advances.map((a) => ({ name: a.reason, amount: Number(a.amount) })),
    statutory: { payeEnabled: Number(await getSetting("payroll.paye_enabled")) === 1, pensionPct: Number(await getSetting("payroll.pension_pct")), nhfPct: Number(await getSetting("payroll.nhf_pct")) },
    proRata: fraction,
  });
  const result = { gross: b.gross, net: b.net, notes: [`${Math.round(fraction * 100)}% of ${m} working days`, ...(advances.length ? [`${advances.length} outstanding advance${advances.length > 1 ? "s" : ""} recovered`] : []), "Attendance deductions for the month are added by payroll."] };
  await db.$transaction(async (tx) => {
    await tx.exitCase.update({ where: { id: e.id }, data: { finalPayEnc: encryptOptional(JSON.stringify(result)) } });
    await audit(tx, { actorId: ctx.userId, action: "exit.final_pay", entityType: "ExitCase", entityId: e.id });
  });
  return result;
}

/**
 * Revoke access: status EXITED, every session ended, grants revoked, devices unbound.
 * Done on or after the last working day (or immediately for terminations).
 */
export async function revokeAccess(ctx: Ctx, exitId: string) {
  requireScope(ctx, "hr.staff", "EDIT");
  const e = await db.exitCase.findUnique({ where: { id: exitId }, include: { user: { include: { role: { select: { key: true } } } } } });
  if (!e) throw new NotFoundError("Exit");
  if (e.accessRevokedAt) throw new RuleError("Access is already revoked");
  if (e.type !== "TERMINATION" && e.lastWorkingDay > new Date()) throw new RuleError("Revoke on or after the last working day (terminations can be immediate)");
  if (e.user.role.key === "super_admin" && (await db.user.count({ where: { status: "ACTIVE", role: { key: "super_admin" }, id: { not: e.userId } } })) === 0) throw new RuleError("This is the last Super Admin — appoint another first");
  await requireRecentAuth(ctx);
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: e.userId }, data: { status: "EXITED", sessionVersion: { increment: 1 } } });
    await tx.userSession.updateMany({ where: { userId: e.userId, revokedAt: null }, data: { revokedAt: now } });
    await tx.userGrant.updateMany({ where: { userId: e.userId, revokedAt: null }, data: { revokedAt: now } });
    await tx.authToken.deleteMany({ where: { userId: e.userId } });
    await tx.exitCase.update({ where: { id: e.id }, data: { accessRevokedAt: now, status: "settled" } });
    await audit(tx, { actorId: ctx.userId, action: "exit.revoke_access", entityType: "User", entityId: e.userId, after: { exit: e.id } });
  });
  const openTasks = await db.task.count({ where: { assigneeId: e.userId, status: { not: "DONE" } } });
  const managers = await db.user.findMany({ where: { status: "ACTIVE", role: { key: { in: ["hr", "super_admin", "ops_manager"] } } }, select: { id: true } });
  await notify({ userIds: managers.map((m) => m.id), type: "exit.revoked", title: `${e.user.name}'s access has been revoked`, body: openTasks ? `${openTasks} open task${openTasks > 1 ? "s" : ""} still assigned — reassign them.` : undefined, link: `/team/staff/${e.userId}` });
}

export async function closeExit(ctx: Ctx, exitId: string) {
  requireScope(ctx, "hr.staff", "EDIT");
  const e = await db.exitCase.findUnique({ where: { id: exitId } });
  if (!e) throw new NotFoundError("Exit");
  if (!e.accessRevokedAt) throw new RuleError("Revoke access before closing the exit");
  const open = (e.handoverChecklist as Item[]).filter((i) => !i.done);
  if (open.length) throw new RuleError(`Finish the checklist first: ${open.map((i) => i.item).join(", ")}`);
  await db.$transaction(async (tx) => {
    await tx.exitCase.update({ where: { id: e.id }, data: { status: "closed" } });
    await audit(tx, { actorId: ctx.userId, action: "exit.close", entityType: "ExitCase", entityId: e.id });
  });
}
