import "server-only";
import { z } from "zod";
import { audit } from "@/server/audit/audit";
import { ACTIONS, isModule, MODULES, SCOPES, type PermAction, type PermModule, type PermScope } from "@/server/authz/catalog";
import { requireScope, type Ctx } from "@/server/authz/context";
import { NotFoundError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";

export async function listRoles(ctx: Ctx) {
  requireScope(ctx, "roles", "VIEW");
  const roles = await db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: { permissions: true, _count: { select: { users: true } } },
  });
  return roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    requires2fa: r.requires2fa,
    users: r._count.users,
    permissions: r.permissions.filter((p) => isModule(p.module)).map((p) => ({ module: p.module as PermModule, action: p.action as PermAction, scope: p.scope as PermScope })),
  }));
}

const SaveInput = z.object({
  roleId: z.string().cuid(),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).optional(),
  requires2fa: z.boolean(),
  permissions: z
    .array(z.object({ module: z.string(), action: z.enum(ACTIONS), scope: z.enum(SCOPES) }))
    .max(Object.keys(MODULES).length * ACTIONS.length),
});

/** Replace a role's permission matrix. Every change is audited with before/after (PRD §3). */
export async function saveRole(ctx: Ctx, raw: unknown) {
  requireScope(ctx, "roles", "EDIT");
  const input = SaveInput.parse(raw);
  const role = await db.role.findUnique({ where: { id: input.roleId }, include: { permissions: true } });
  if (!role) throw new NotFoundError("Role");
  const perms = input.permissions.filter((p) => isModule(p.module));
  if (role.key === "super_admin") {
    const needed = ["roles:EDIT", "roles:VIEW", "settings:EDIT"];
    if (!needed.every((k) => perms.some((p) => `${p.module}:${p.action}` === k && p.scope === "ALL"))) {
      throw new RuleError("Super Admin must keep role management and settings, or nobody could fix permissions");
    }
  }
  const unique = new Map(perms.map((p) => [`${p.module}:${p.action}`, p]));
  await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    await tx.rolePermission.createMany({ data: [...unique.values()].map((p) => ({ roleId: role.id, module: p.module, action: p.action, scope: p.scope })) });
    await tx.role.update({ where: { id: role.id }, data: { name: input.name, description: input.description || null, requires2fa: input.requires2fa } });
    await audit(tx, {
      actorId: ctx.userId,
      action: "role.permissions.update",
      entityType: "Role",
      entityId: role.id,
      before: { name: role.name, requires2fa: role.requires2fa, permissions: role.permissions.map((p) => `${p.module}:${p.action}:${p.scope}`).sort() },
      after: { name: input.name, requires2fa: input.requires2fa, permissions: [...unique.values()].map((p) => `${p.module}:${p.action}:${p.scope}`).sort() },
    });
  });
}

export async function cloneRole(ctx: Ctx, raw: unknown): Promise<{ id: string }> {
  requireScope(ctx, "roles", "CREATE");
  const { roleId, name } = z.object({ roleId: z.string().cuid(), name: z.string().trim().min(2).max(60) }).parse(raw);
  const src = await db.role.findUnique({ where: { id: roleId }, include: { permissions: true } });
  if (!src) throw new NotFoundError("Role");
  const key = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_${Date.now().toString(36)}`;
  return db.$transaction(async (tx) => {
    const r = await tx.role.create({
      data: {
        key,
        name,
        description: src.description,
        requires2fa: src.requires2fa,
        clonedFromId: src.id,
        permissions: { create: src.permissions.map((p) => ({ module: p.module, action: p.action, scope: p.scope })) },
      },
    });
    await audit(tx, { actorId: ctx.userId, action: "role.create", entityType: "Role", entityId: r.id, after: { name, clonedFrom: src.key } });
    return { id: r.id };
  });
}

export async function deleteRole(ctx: Ctx, roleId: string) {
  requireScope(ctx, "roles", "DELETE");
  const r = await db.role.findUnique({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
  if (!r) throw new NotFoundError("Role");
  if (r.isSystem) throw new RuleError("Default roles can be edited but not deleted");
  if (r._count.users) throw new RuleError("Move everyone off this role first");
  await db.$transaction(async (tx) => {
    await tx.role.delete({ where: { id: r.id } });
    await audit(tx, { actorId: ctx.userId, action: "role.delete", entityType: "Role", entityId: r.id, before: { name: r.name } });
  });
}
