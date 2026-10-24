// Builds an isolated set of users per test file. Nothing is deleted afterwards:
// the audit log is append-only, so tests add uniquely-named data instead.
import { randomUUID } from "node:crypto";
import type { UnitCode } from "@prisma/client";
import { isoWeekday, localDate } from "@/domain/sop/schedule";
import { loadCtx } from "@/server/authz/context";
import { DEFAULT_ROLES, grantRows } from "@/server/authz/default-roles";
import { db } from "@/server/db";

export async function ensureRolesAndUnits() {
  for (const r of DEFAULT_ROLES) {
    const role = await db.role.upsert({
      where: { key: r.key },
      update: {},
      create: { key: r.key, name: r.name, description: r.description, isSystem: true, requires2fa: r.requires2fa },
    });
    // keep test DB roles in step with the code defaults
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({
      data: grantRows(r).map((g) => ({ roleId: role.id, ...g })),
    });
  }
  const units = {} as Record<UnitCode, string>;
  for (const code of ["ACADEMY", "FIGUREWEB", "TELECOM", "HQ"] as const) {
    const u = await db.businessUnit.upsert({ where: { code }, update: {}, create: { code, name: code, accentColor: "#000" } });
    units[code] = u.id;
  }
  return units;
}

export async function makeUser(opts: { role: string; unitId: string; extraUnitIds?: string[]; status?: "ACTIVE" | "ONBOARDING" | "EXITED" }) {
  const role = await db.role.findUniqueOrThrow({ where: { key: opts.role } });
  return db.user.create({
    data: {
      email: `${opts.role}-${randomUUID()}@test.figuraid.com`,
      name: `Test ${opts.role}`,
      status: opts.status ?? "ACTIVE",
      roleId: role.id,
      primaryUnitId: opts.unitId,
      units: { create: (opts.extraUnitIds ?? []).map((unitId) => ({ unitId })) },
    },
  });
}

export const ctxFor = (userId: string) => loadCtx(userId);

/** A weekly SOP that falls due exactly once in the catch-up window: today. */
export async function makeSopDueToday(opts: { unitId: string; ownerId: string; assigneeIds: string[]; steps?: string[] }) {
  const today = localDate(new Date());
  return db.sop.create({
    data: {
      unitId: opts.unitId,
      ownerId: opts.ownerId,
      title: `SOP ${randomUUID().slice(0, 8)}`,
      frequency: "WEEKLY",
      weekdays: [isoWeekday(today)],
      startsOn: new Date(today),
      dueTime: "17:00",
      steps: { create: (opts.steps ?? ["First", "Second", "Third"]).map((title, i) => ({ position: i + 1, title })) },
      assignees: { create: opts.assigneeIds.map((userId) => ({ userId })) },
    },
  });
}

export async function isHolidayToday() {
  return !!(await db.publicHoliday.findUnique({ where: { date: new Date(localDate(new Date())) } }));
}
