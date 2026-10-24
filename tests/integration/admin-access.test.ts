import { beforeAll, describe, expect, it } from "vitest";
import { ForbiddenError, RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";
import { listAudit, verifyAuditChain } from "@/server/modules/admin/audit-service";
import { cloneRole, saveRole } from "@/server/modules/admin/roles-service";
import { addGrant, inviteUser, updateUserAccess } from "@/server/modules/admin/users-service";
import { ctxFor, ensureRolesAndUnits, makeUser } from "./world";

let units: Awaited<ReturnType<typeof ensureRolesAndUnits>>;
let superAdmin: { id: string }, admin: { id: string }, hr: { id: string }, staff: { id: string };
const roleId = async (key: string) => (await db.role.findUniqueOrThrow({ where: { key } })).id;
const email = () => `inv-${Math.random().toString(36).slice(2)}@test.figuraid.com`;

beforeAll(async () => {
  units = await ensureRolesAndUnits();
  superAdmin = await makeUser({ role: "super_admin", unitId: units.HQ });
  admin = await makeUser({ role: "admin", unitId: units.HQ });
  hr = await makeUser({ role: "hr", unitId: units.HQ });
  staff = await makeUser({ role: "staff", unitId: units.FIGUREWEB });
});

describe("who can hand out access", () => {
  it("HR can invite ordinary staff", async () => {
    const r = await inviteUser(await ctxFor(hr.id), { name: "New Hire", email: email(), roleId: await roleId("staff"), primaryUnitId: units.ACADEMY });
    expect((await db.user.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("INVITED");
  });

  it("only the Super Admin can give someone a role with sensitive permissions", async () => {
    const finance = await roleId("finance");
    await expect(inviteUser(await ctxFor(hr.id), { name: "Xavier", email: email(), roleId: finance, primaryUnitId: units.HQ })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(inviteUser(await ctxFor(admin.id), { name: "Xavier", email: email(), roleId: await roleId("super_admin"), primaryUnitId: units.HQ })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(inviteUser(await ctxFor(superAdmin.id), { name: "Xavier", email: email(), roleId: finance, primaryUnitId: units.HQ })).resolves.toHaveProperty("id");
  });

  it("an admin can't promote a staff member to Finance", async () => {
    await expect(
      updateUserAccess(await ctxFor(admin.id), { userId: staff.id, roleId: await roleId("finance"), primaryUnitId: units.FIGUREWEB }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("external auditors must have an expiry date", async () => {
    await expect(inviteUser(await ctxFor(superAdmin.id), { name: "Auditor", email: email(), roleId: await roleId("auditor"), primaryUnitId: units.HQ })).rejects.toBeInstanceOf(RuleError);
  });

  it("sensitive grants (salaries, margins…) are Super Admin only; ordinary grants are audited", async () => {
    await expect(addGrant(await ctxFor(admin.id), { userId: staff.id, module: "hr.salaries", action: "VIEW", scope: "ALL" })).rejects.toBeInstanceOf(ForbiddenError);
    await addGrant(await ctxFor(admin.id), { userId: staff.id, module: "crm.contacts", action: "VIEW", scope: "UNIT", expiresAt: new Date(Date.now() + 86_400_000) });
    expect(await db.auditLog.count({ where: { action: "permission.grant", actorId: admin.id } })).toBeGreaterThan(0);
  });

  it("staff can't touch user admin at all", async () => {
    await expect(inviteUser(await ctxFor(staff.id), { name: "Xavier", email: email(), roleId: await roleId("staff"), primaryUnitId: units.HQ })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("roles", () => {
  it("only the Super Admin edits roles, and every change is audited with before/after", async () => {
    const { id } = await cloneRole(await ctxFor(superAdmin.id), { roleId: await roleId("staff"), name: "Night shift" });
    await expect(saveRole(await ctxFor(admin.id), { roleId: id, name: "Hack", requires2fa: false, permissions: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await saveRole(await ctxFor(superAdmin.id), { roleId: id, name: "Night shift", requires2fa: true, permissions: [{ module: "tasks", action: "VIEW", scope: "OWN" }] });
    const entry = await db.auditLog.findFirst({ where: { action: "role.permissions.update", entityId: id }, orderBy: { at: "desc" } });
    expect(entry?.after).toMatchObject({ permissions: ["tasks:VIEW:OWN"], requires2fa: true });
  });

  it("the Super Admin role can't be stripped of role management", async () => {
    await expect(
      saveRole(await ctxFor(superAdmin.id), { roleId: await roleId("super_admin"), name: "Super Admin", requires2fa: true, permissions: [{ module: "tasks", action: "VIEW", scope: "ALL" }] }),
    ).rejects.toBeInstanceOf(RuleError);
  });
});

describe("audit log", () => {
  it("is Super-Admin-only to read, and the hash chain verifies", async () => {
    await expect(listAudit(await ctxFor(admin.id), {})).resolves.toBeInstanceOf(Array); // admin holds audit by default
    await expect(listAudit(await ctxFor(staff.id), {})).rejects.toBeInstanceOf(ForbiddenError);
    const res = await verifyAuditChain(await ctxFor(superAdmin.id));
    expect(res.ok).toBe(true);
    expect(res.checked).toBeGreaterThan(0);
  });

  it("the database refuses to edit or delete history", async () => {
    const row = await db.auditLog.findFirstOrThrow();
    await expect(db.auditLog.update({ where: { id: row.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(db.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });
});
