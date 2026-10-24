import "server-only";
import { z } from "zod";
import { audit } from "@/server/audit/audit";
import { isSensitive, type PermModule } from "@/server/authz/catalog";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { issueInvite, signOutEverywhere } from "@/server/modules/account/service";

const id = z.string().cuid();

/** People admin is Settings (admins) or HR staff records. */
function requirePeopleAdmin(ctx: Ctx, action: "VIEW" | "CREATE" | "EDIT") {
  if (can(ctx, "settings", action)) return;
  requireScope(ctx, "hr.staff", action);
}

/** Assigning a role that holds any sensitive permission is role management (Super Admin only). */
async function assertMayAssignRole(ctx: Ctx, roleId: string) {
  const role = await db.role.findUnique({ where: { id: roleId }, include: { permissions: { select: { module: true } } } });
  if (!role) throw new RuleError("Unknown role");
  if (role.permissions.some((p) => isSensitive(p.module)) && !can(ctx, "roles", "EDIT")) {
    throw new ForbiddenError("roles:EDIT");
  }
  return role;
}

export async function listUsers(ctx: Ctx) {
  requirePeopleAdmin(ctx, "VIEW");
  const users = await db.user.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      role: { select: { id: true, name: true, key: true } },
      primaryUnit: { select: { id: true, code: true, name: true } },
      units: { select: { unitId: true } },
      manager: { select: { id: true, name: true } },
      grants: { where: { revokedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    status: u.status,
    role: u.role,
    primaryUnit: u.primaryUnit,
    unitIds: u.units.map((x) => x.unitId),
    manager: u.manager,
    has2fa: !!u.twoFactorEnabledAt,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    accessExpiresAt: u.accessExpiresAt?.toISOString() ?? null,
    grants: u.grants.map((g) => ({ id: g.id, module: g.module, action: g.action, scope: g.scope, expiresAt: g.expiresAt?.toISOString() ?? null, reason: g.reason })),
  }));
}

const InviteInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  roleId: id,
  primaryUnitId: id,
  unitIds: z.array(id).max(10).default([]),
  managerId: id.nullable().default(null),
  accessExpiresAt: z.coerce.date().nullable().default(null),
});

export async function inviteUser(ctx: Ctx, raw: unknown): Promise<{ id: string }> {
  requirePeopleAdmin(ctx, "CREATE");
  const input = InviteInput.parse(raw);
  const role = await assertMayAssignRole(ctx, input.roleId);
  if (role.key === "auditor" && !input.accessExpiresAt) throw new RuleError("External auditors need an access expiry date");
  if (await db.user.findUnique({ where: { email: input.email } })) throw new RuleError("Someone already has that email");
  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        roleId: input.roleId,
        primaryUnitId: input.primaryUnitId,
        managerId: input.managerId,
        accessExpiresAt: input.accessExpiresAt,
        status: "INVITED",
        units: { create: input.unitIds.filter((u) => u !== input.primaryUnitId).map((unitId) => ({ unitId })) },
      },
    });
    await audit(tx, { actorId: ctx.userId, action: "user.invite", entityType: "User", entityId: u.id, after: { email: u.email, role: role.key } });
    return u;
  });
  await issueInvite(user.id);
  return { id: user.id };
}

export async function resendInvite(ctx: Ctx, userId: string) {
  requirePeopleAdmin(ctx, "CREATE");
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u) throw new NotFoundError("User");
  if (u.status !== "INVITED") throw new RuleError("They've already accepted");
  await issueInvite(userId);
}

const AccessInput = z.object({
  userId: id,
  roleId: id,
  primaryUnitId: id,
  unitIds: z.array(id).max(10).default([]),
  managerId: id.nullable().default(null),
  status: z.enum(["ACTIVE", "ONBOARDING", "SUSPENDED"]).optional(),
  accessExpiresAt: z.coerce.date().nullable().default(null),
});

export async function updateUserAccess(ctx: Ctx, raw: unknown) {
  requirePeopleAdmin(ctx, "EDIT");
  const input = AccessInput.parse(raw);
  const user = await db.user.findUnique({ where: { id: input.userId }, include: { units: true, role: true } });
  if (!user) throw new NotFoundError("User");
  if (user.id === ctx.userId && input.roleId !== user.roleId) throw new RuleError("You can't change your own role");
  if (input.roleId !== user.roleId) await assertMayAssignRole(ctx, input.roleId);
  // Changing a Super Admin's access is itself role management.
  if (user.role.key === "super_admin" && !can(ctx, "roles", "EDIT")) throw new ForbiddenError("roles:EDIT");
  await db.$transaction(async (tx) => {
    await tx.userUnit.deleteMany({ where: { userId: user.id } });
    await tx.user.update({
      where: { id: user.id },
      data: {
        roleId: input.roleId,
        primaryUnitId: input.primaryUnitId,
        managerId: input.managerId === user.id ? null : input.managerId,
        accessExpiresAt: input.accessExpiresAt,
        ...(input.status ? { status: input.status } : {}),
        units: { create: input.unitIds.filter((u) => u !== input.primaryUnitId).map((unitId) => ({ unitId })) },
      },
    });
    if (input.status === "SUSPENDED") {
      await tx.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
      await tx.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    await audit(tx, {
      actorId: ctx.userId,
      action: "user.access.update",
      entityType: "User",
      entityId: user.id,
      before: { roleId: user.roleId, primaryUnitId: user.primaryUnitId, unitIds: user.units.map((u) => u.unitId), status: user.status },
      after: { roleId: input.roleId, primaryUnitId: input.primaryUnitId, unitIds: input.unitIds, status: input.status ?? user.status },
    });
  });
}

const GrantInput = z.object({
  userId: id,
  module: z.string().max(60),
  action: z.enum(["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "EXPORT"]),
  scope: z.enum(["OWN", "UNIT", "ALL"]),
  expiresAt: z.coerce.date().nullable().default(null),
  reason: z.string().trim().max(300).optional(),
});

/** Individual extra grant, optionally temporary. Sensitive modules: Super Admin only. */
export async function addGrant(ctx: Ctx, raw: unknown) {
  const input = GrantInput.parse(raw);
  requireScope(ctx, "settings", "EDIT");
  if (isSensitive(input.module) && !can(ctx, "roles", "EDIT")) throw new ForbiddenError("roles:EDIT");
  if (input.expiresAt && input.expiresAt < new Date()) throw new RuleError("Expiry must be in the future");
  await db.$transaction(async (tx) => {
    const g = await tx.userGrant.create({
      data: { userId: input.userId, module: input.module as PermModule, action: input.action, scope: input.scope, expiresAt: input.expiresAt, reason: input.reason, grantedById: ctx.userId },
    });
    await audit(tx, { actorId: ctx.userId, action: "permission.grant", entityType: "UserGrant", entityId: g.id, after: { ...input, expiresAt: input.expiresAt?.toISOString() ?? null } });
  });
}

export async function revokeGrant(ctx: Ctx, grantId: string) {
  requireScope(ctx, "settings", "EDIT");
  const g = await db.userGrant.findUnique({ where: { id: grantId } });
  if (!g) throw new NotFoundError("Grant");
  if (isSensitive(g.module) && !can(ctx, "roles", "EDIT")) throw new ForbiddenError("roles:EDIT");
  await db.$transaction(async (tx) => {
    await tx.userGrant.update({ where: { id: g.id }, data: { revokedAt: new Date() } });
    await audit(tx, { actorId: ctx.userId, action: "permission.revoke", entityType: "UserGrant", entityId: g.id, before: { module: g.module, action: g.action, scope: g.scope } });
  });
}

export async function adminSignOutUser(ctx: Ctx, userId: string) {
  requireScope(ctx, "settings", "EDIT");
  await signOutEverywhere(userId, ctx.userId);
}

/** Lost phone: Super Admin clears 2FA so the person can enrol again at next sign-in. */
export async function adminReset2fa(ctx: Ctx, userId: string) {
  requireScope(ctx, "roles", "EDIT");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { twoFactorEnabledAt: null, totpSecretEnc: null, totpLastCounter: null } });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await audit(tx, { actorId: ctx.userId, action: "auth.2fa.admin_reset", entityType: "User", entityId: userId });
  });
  await signOutEverywhere(userId, ctx.userId);
}
