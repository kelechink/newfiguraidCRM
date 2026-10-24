import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/server/audit/audit";
import { can, requireScope, scopeWhere, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { requireRecentAuth } from "@/server/auth/session";
import { decryptOptional, encryptOptional, maskTail } from "@/server/crypto/field";
import { db } from "@/server/db";

const id = z.string().cuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");

export type Allowance = { name: string; amount: number };

function staffWhere(ctx: Ctx, action: "VIEW" | "EDIT" | "CREATE"): Prisma.UserWhereInput {
  return scopeWhere<Prisma.UserWhereInput>(ctx, requireScope(ctx, "hr.staff", action), {
    unit: (ids) => ({ OR: [{ primaryUnitId: { in: ids } }, { units: { some: { unitId: { in: ids } } } }] }),
    own: (me) => ({ id: me }),
  });
}

export async function listStaff(ctx: Ctx, raw: unknown) {
  const f = z.object({ q: z.string().trim().max(80).optional(), status: z.enum(["INVITED", "ONBOARDING", "ACTIVE", "SUSPENDED", "EXITED"]).optional(), unitId: id.nullable().optional() }).parse(raw ?? {});
  const rows = await db.user.findMany({
    where: {
      AND: [
        staffWhere(ctx, "VIEW"),
        f.status ? { status: f.status } : { status: { not: "EXITED" } },
        f.unitId ? { OR: [{ primaryUnitId: f.unitId }, { units: { some: { unitId: f.unitId } } }] } : {},
        f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } }, { staffProfile: { jobTitle: { contains: f.q, mode: "insensitive" } } }] } : {},
      ],
    },
    include: { role: { select: { name: true } }, primaryUnit: { select: { code: true, name: true } }, staffProfile: { select: { employeeNo: true, jobTitle: true, employmentType: true, startDate: true, probationEnds: true } }, contractPacks: { where: { purpose: "onboarding" }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 500,
  });
  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status,
    role: u.role.name,
    unit: u.primaryUnit?.code ?? null,
    unitName: u.primaryUnit?.name ?? null,
    employeeNo: u.staffProfile?.employeeNo ?? null,
    jobTitle: u.staffProfile?.jobTitle ?? null,
    employmentType: u.staffProfile?.employmentType ?? null,
    startDate: u.staffProfile?.startDate.toISOString().slice(0, 10) ?? null,
    onProbation: !!u.staffProfile?.probationEnds && u.staffProfile.probationEnds > new Date(),
    pack: u.contractPacks[0]?.status ?? null,
  }));
}

/** Read sensitive fields: the person themselves, or holders of hr.salaries / hr.bank_details. Reads of others are audited. */
export async function getStaff(ctx: Ctx, userId: string) {
  const self = userId === ctx.userId;
  const u = await db.user.findFirst({
    // salary and payroll holders (Finance) open records without general HR access
    where: self || (!can(ctx, "hr.staff", "VIEW") && (can(ctx, "hr.salaries", "VIEW") || can(ctx, "payroll", "VIEW"))) ? { id: userId } : { AND: [{ id: userId }, staffWhere(ctx, "VIEW")] },
    include: { role: { select: { name: true, key: true } }, primaryUnit: { select: { id: true, name: true, code: true } }, staffProfile: { include: { office: { select: { id: true, name: true } }, latenessPolicy: { select: { id: true, name: true } } } } },
  });
  if (!u) throw new NotFoundError("Staff member");
  const p = u.staffProfile;
  const seePay = self || can(ctx, "hr.salaries", "VIEW");
  const seeBank = self || can(ctx, "hr.bank_details", "VIEW");
  if (!self && p && ((seePay && p.salaryEnc) || (seeBank && p.bankAccountEnc))) {
    await db.$transaction((tx) => audit(tx, { actorId: ctx.userId, action: "staff.view_sensitive", entityType: "User", entityId: u.id, after: { salary: seePay, bank: seeBank } }));
  }
  const allowances = seePay && p?.allowancesEnc ? (JSON.parse(decryptOptional(p.allowancesEnc) ?? "[]") as Allowance[]) : null;
  const account = seeBank ? decryptOptional(p?.bankAccountEnc) : null;
  const idNo = seeBank ? decryptOptional(p?.idNumberEnc) : null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status,
    role: u.role,
    unit: u.primaryUnit,
    self,
    profile: p
      ? {
          employeeNo: p.employeeNo,
          jobTitle: p.jobTitle,
          employmentType: p.employmentType,
          startDate: p.startDate.toISOString().slice(0, 10),
          probationEnds: p.probationEnds?.toISOString().slice(0, 10) ?? null,
          phone: p.phone,
          personalEmail: p.personalEmail,
          address: p.address,
          dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
          nextOfKin: (p.nextOfKin as { name: string; relationship: string; phone: string } | null) ?? null,
          office: p.office,
          resumeTime: p.resumeTime,
          closeTime: p.closeTime,
          workingDays: p.workingDays,
          graceMinutes: p.graceMinutes,
          remoteAllowed: p.remoteAllowed,
          latenessPolicy: p.latenessPolicy,
          onboardedAt: p.onboardedAt?.toISOString() ?? null,
        }
      : null,
    pay: seePay && p ? { salary: p.salaryEnc ? Number(decryptOptional(p.salaryEnc)) : null, allowances: allowances ?? [] } : null,
    bank: seeBank && p ? { bankName: decryptOptional(p.bankNameEnc), accountName: decryptOptional(p.accountNameEnc), accountMasked: account ? maskTail(account) : null, idMasked: idNo ? maskTail(idNo) : null } : null,
    can: { edit: can(ctx, "hr.staff", "EDIT"), editPay: can(ctx, "hr.salaries", "EDIT"), editBank: self || can(ctx, "hr.bank_details", "EDIT"), viewPay: seePay, viewBank: seeBank },
  };
}

async function nextEmployeeNo(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('employee-no'))`;
  const last = await tx.staffProfile.findFirst({ where: { employeeNo: { startsWith: "FIG-" } }, orderBy: { employeeNo: "desc" }, select: { employeeNo: true } });
  return `FIG-${String((last ? Number(last.employeeNo.slice(4)) : 0) + 1).padStart(4, "0")}`;
}

const ProfileInput = z.object({
  userId: id,
  jobTitle: z.string().trim().min(2).max(100),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "NYSC"]),
  startDate: z.coerce.date(),
  probationEnds: z.coerce.date().nullable().default(null),
  phone: z.string().trim().max(40).optional(),
  personalEmail: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional(),
  dateOfBirth: z.coerce.date().nullable().default(null),
  nextOfKin: z.object({ name: z.string().trim().max(100), relationship: z.string().trim().max(40), phone: z.string().trim().max(40) }).nullable().default(null),
  officeId: id.nullable().default(null),
  resumeTime: time.default("09:00"),
  closeTime: time.default("17:00"),
  workingDays: z.array(z.number().int().min(1).max(7)).min(1).max(7).default([1, 2, 3, 4, 5]),
  graceMinutes: z.coerce.number().int().min(0).max(120).default(15),
  remoteAllowed: z.boolean().default(false),
  latenessPolicyId: id.nullable().default(null),
});

export async function saveProfile(ctx: Ctx, raw: unknown) {
  const input = ProfileInput.parse(raw);
  const u = await db.user.findFirst({ where: { AND: [{ id: input.userId }, staffWhere(ctx, "EDIT")] }, include: { staffProfile: true } });
  if (!u) throw new NotFoundError("Staff member");
  if (input.closeTime <= input.resumeTime) throw new RuleError("Close time must be after resume time");
  const { userId, ...fields } = input;
  const data = { ...fields, phone: fields.phone || null, personalEmail: fields.personalEmail || null, address: fields.address || null, nextOfKin: fields.nextOfKin ?? undefined };
  await db.$transaction(async (tx) => {
    if (u.staffProfile) await tx.staffProfile.update({ where: { userId }, data });
    else await tx.staffProfile.create({ data: { ...data, userId, employeeNo: await nextEmployeeNo(tx) } });
    await audit(tx, { actorId: ctx.userId, action: u.staffProfile ? "staff.profile.update" : "staff.profile.create", entityType: "User", entityId: userId, before: u.staffProfile ? { jobTitle: u.staffProfile.jobTitle, resumeTime: u.staffProfile.resumeTime, policy: u.staffProfile.latenessPolicyId } : undefined, after: { jobTitle: input.jobTitle, resumeTime: input.resumeTime, policy: input.latenessPolicyId } });
  });
}

const PayInput = z.object({ userId: id, salary: z.coerce.number().min(0).max(1e10), allowances: z.array(z.object({ name: z.string().trim().min(1).max(60), amount: z.coerce.number().min(0).max(1e10) })).max(20).default([]) });

/** Salary is encrypted at rest; changing it needs hr.salaries EDIT and a fresh password. The audit log never holds the figures. */
export async function savePay(ctx: Ctx, raw: unknown) {
  const input = PayInput.parse(raw);
  if (!can(ctx, "hr.salaries", "EDIT")) throw new ForbiddenError("hr.salaries:EDIT");
  if (input.userId === ctx.userId) throw new RuleError("Someone else must set your own pay");
  const p = await db.staffProfile.findUnique({ where: { userId: input.userId } });
  if (!p) throw new RuleError("Create the staff profile first");
  await requireRecentAuth(ctx);
  await db.$transaction(async (tx) => {
    await tx.staffProfile.update({ where: { userId: input.userId }, data: { salaryEnc: encryptOptional(String(input.salary)), allowancesEnc: encryptOptional(JSON.stringify(input.allowances)) } });
    await audit(tx, { actorId: ctx.userId, action: "staff.pay.update", entityType: "User", entityId: input.userId, after: { changed: true, allowances: input.allowances.length } });
  });
}

const BankInput = z.object({
  userId: id,
  bankName: z.string().trim().min(2).max(80),
  accountNumber: z.string().trim().regex(/^\d{10}$/, "NUBAN account numbers are 10 digits"),
  accountName: z.string().trim().min(2).max(120),
  idNumber: z.string().trim().max(30).optional(),
});

export async function saveBank(ctx: Ctx, raw: unknown) {
  const input = BankInput.parse(raw);
  const self = input.userId === ctx.userId;
  if (!self && !can(ctx, "hr.bank_details", "EDIT")) throw new ForbiddenError("hr.bank_details:EDIT");
  const p = await db.staffProfile.findUnique({ where: { userId: input.userId } });
  if (!p) throw new RuleError("Create the staff profile first");
  await requireRecentAuth(ctx);
  await db.$transaction(async (tx) => {
    await tx.staffProfile.update({
      where: { userId: input.userId },
      data: { bankNameEnc: encryptOptional(input.bankName), bankAccountEnc: encryptOptional(input.accountNumber), accountNameEnc: encryptOptional(input.accountName), ...(input.idNumber ? { idNumberEnc: encryptOptional(input.idNumber) } : {}) },
    });
    await audit(tx, { actorId: ctx.userId, action: "staff.bank.update", entityType: "User", entityId: input.userId, after: { self } });
  });
  // a changed payout account is a classic fraud vector: tell the owner every time
  const owner = await db.user.findUniqueOrThrow({ where: { id: input.userId }, select: { id: true } });
  const { notify } = await import("@/server/notify/notify");
  await notify({ userIds: [owner.id], type: "security.bank_changed", title: "Your salary bank account was changed", body: `Now ${input.bankName} ${maskTail(input.accountNumber)}. If this wasn't you, contact HR immediately.`, link: "/me", email: true });
}
