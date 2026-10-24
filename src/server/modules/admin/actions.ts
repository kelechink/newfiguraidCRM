"use server";

import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { listAudit, verifyAuditChain } from "./audit-service";
import { cloneRole, deleteRole, saveRole } from "./roles-service";
import { addGrant, adminReset2fa, adminSignOutUser, inviteUser, resendInvite, revokeGrant, updateUserAccess } from "./users-service";

const done = <T>(p: Promise<T>, path: string) =>
  p.then((r) => {
    revalidatePath(path);
    return r;
  });

export async function inviteUserAction(input: unknown) {
  return runAction((ctx) => done(inviteUser(ctx, input), "/settings/users"));
}
export async function resendInviteAction(userId: string) {
  return runAction((ctx) => resendInvite(ctx, String(userId)));
}
export async function updateUserAccessAction(input: unknown) {
  return runAction((ctx) => done(updateUserAccess(ctx, input), "/settings/users"));
}
export async function addGrantAction(input: unknown) {
  return runAction((ctx) => done(addGrant(ctx, input), "/settings/users"));
}
export async function revokeGrantAction(id: string) {
  return runAction((ctx) => done(revokeGrant(ctx, String(id)), "/settings/users"));
}
export async function adminSignOutAction(userId: string) {
  return runAction((ctx) => adminSignOutUser(ctx, String(userId)));
}
export async function adminReset2faAction(userId: string) {
  return runAction((ctx) => adminReset2fa(ctx, String(userId)));
}
export async function saveRoleAction(input: unknown) {
  return runAction((ctx) => done(saveRole(ctx, input), "/settings/roles"));
}
export async function cloneRoleAction(input: unknown) {
  return runAction((ctx) => done(cloneRole(ctx, input), "/settings/roles"));
}
export async function deleteRoleAction(id: string) {
  return runAction((ctx) => done(deleteRole(ctx, String(id)), "/settings/roles"));
}
export async function listAuditAction(filter: unknown) {
  return runAction((ctx) => listAudit(ctx, filter));
}
export async function verifyAuditAction() {
  return runAction((ctx) => verifyAuditChain(ctx));
}
