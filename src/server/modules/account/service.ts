import "server-only";
import QRCode from "qrcode";
import { z } from "zod";
import { audit } from "@/server/audit/audit";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { passwordProblem } from "@/server/auth/password-policy";
import type { Ctx } from "@/server/authz/context";
import { RuleError } from "@/server/authz/errors";
import { decrypt, encrypt } from "@/server/crypto/field";
import { newToken, sha256 } from "@/server/crypto/tokens";
import { newRecoveryCodes, newTotpSecret, otpauthUri, verifyTotp } from "@/server/crypto/totp";
import { db } from "@/server/db";
import { appUrl, sendEmail } from "@/server/email/send";

// ── two-factor ───────────────────────────────────────────────────────────────

export async function startTotpEnrollment(ctx: Ctx): Promise<{ secret: string; qr: string }> {
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (user.twoFactorEnabledAt) throw new RuleError("Two-factor sign-in is already on");
  const secret = newTotpSecret();
  await db.user.update({ where: { id: ctx.userId }, data: { totpSecretEnc: encrypt(secret), totpLastCounter: null } });
  const qr = await QRCode.toDataURL(otpauthUri(secret, user.email), { margin: 1, width: 220 });
  return { secret, qr };
}

export async function confirmTotpEnrollment(ctx: Ctx, raw: unknown): Promise<{ recoveryCodes: string[] }> {
  const { code } = z.object({ code: z.string().min(6).max(8) }).parse(raw);
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (user.twoFactorEnabledAt || !user.totpSecretEnc) throw new RuleError("Start the set-up again");
  const counter = verifyTotp(decrypt(user.totpSecretEnc), code, null);
  if (counter === null) throw new RuleError("That code didn't match. Check your phone's clock and try the newest code.");
  const codes = newRecoveryCodes();
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ctx.userId }, data: { twoFactorEnabledAt: new Date(), totpLastCounter: counter } });
    await tx.recoveryCode.deleteMany({ where: { userId: ctx.userId } });
    await tx.recoveryCode.createMany({ data: codes.map((c) => ({ userId: ctx.userId, codeHash: sha256(c) })) });
    await audit(tx, { actorId: ctx.userId, action: "auth.2fa.enable", entityType: "User", entityId: ctx.userId });
  });
  return { recoveryCodes: codes };
}

export async function disableTotp(ctx: Ctx, raw: unknown): Promise<void> {
  const { password } = z.object({ password: z.string().min(1) }).parse(raw);
  if (ctx.requires2fa) throw new RuleError("Your role requires two-factor sign-in, so it can't be turned off.");
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, password))) throw new RuleError("Wrong password");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ctx.userId }, data: { twoFactorEnabledAt: null, totpSecretEnc: null, totpLastCounter: null } });
    await tx.recoveryCode.deleteMany({ where: { userId: ctx.userId } });
    await audit(tx, { actorId: ctx.userId, action: "auth.2fa.disable", entityType: "User", entityId: ctx.userId });
  });
}

// ── password & sessions ──────────────────────────────────────────────────────

export async function changePassword(ctx: Ctx, raw: unknown): Promise<void> {
  const { current, next } = z.object({ current: z.string().min(1), next: z.string().min(1).max(128) }).parse(raw);
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, current))) throw new RuleError("Your current password is wrong");
  const problem = await passwordProblem(next, user.email);
  if (problem) throw new RuleError(problem);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: ctx.userId }, data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() } });
    // keep this session, end every other one
    await tx.userSession.updateMany({ where: { userId: ctx.userId, revokedAt: null, id: { not: ctx.sessionId ?? "" } }, data: { revokedAt: new Date() } });
    await audit(tx, { actorId: ctx.userId, action: "auth.password.change", entityType: "User", entityId: ctx.userId });
  });
}

export async function listSessions(ctx: Ctx) {
  const rows = await db.userSession.findMany({
    where: { userId: ctx.userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    take: 20,
  });
  return rows.map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt.toISOString(), lastSeenAt: s.lastSeenAt.toISOString(), current: s.id === ctx.sessionId }));
}

export async function revokeSession(ctx: Ctx, sessionId: string): Promise<void> {
  await db.userSession.updateMany({ where: { id: sessionId, userId: ctx.userId }, data: { revokedAt: new Date() } });
}

/** Remote sign-out of every session, including this one (Security #10). */
export async function signOutEverywhere(userId: string, actorId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    await tx.userSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, { actorId, action: "auth.sessions.revoke_all", entityType: "User", entityId: userId });
  });
}

/** Step-up re-authentication before finance/payroll actions. */
export async function reauthenticate(ctx: Ctx, raw: unknown): Promise<void> {
  const { password, code } = z.object({ password: z.string().min(1), code: z.string().max(12).optional() }).parse(raw);
  const user = await db.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, password))) throw new RuleError("Wrong password");
  if (user.twoFactorEnabledAt) {
    const counter = code && user.totpSecretEnc ? verifyTotp(decrypt(user.totpSecretEnc), code, user.totpLastCounter) : null;
    if (counter === null) throw new RuleError("Enter the current code from your authenticator app");
    await db.user.update({ where: { id: user.id }, data: { totpLastCounter: counter } });
  }
  if (ctx.sessionId) await db.userSession.update({ where: { id: ctx.sessionId }, data: { reauthAt: new Date() } });
}

// ── privacy policy acceptance ────────────────────────────────────────────────

export async function acceptPolicy(ctx: Ctx, policyId: string, ip: string | null, userAgent: string | null): Promise<void> {
  const policy = await db.policyDocument.findFirst({ where: { id: policyId, publishedAt: { not: null } } });
  if (!policy) throw new RuleError("That policy isn't available");
  await db.policyAcceptance.upsert({
    where: { policyId_userId: { policyId, userId: ctx.userId } },
    update: {},
    create: { policyId, userId: ctx.userId, ip, userAgent },
  });
}

// ── invites & password reset (public, token-based) ───────────────────────────

const INVITE_TTL_MS = 7 * 86_400_000;
const RESET_TTL_MS = 60 * 60_000;

export async function issueInvite(userId: string): Promise<string> {
  const token = newToken();
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.authToken.updateMany({ where: { userId, purpose: "INVITE", usedAt: null }, data: { usedAt: new Date() } });
  await db.authToken.create({ data: { userId, purpose: "INVITE", tokenHash: sha256(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) } });
  await sendEmail({
    to: user.email,
    subject: "You've been invited to Figuraid OS",
    text: `Hi ${user.name.split(" ")[0]},\n\nYou've been given an account on Figuraid OS, the company's internal system. Set your password to get started. The link works for 7 days.`,
    template: "invite",
    cta: { label: "Set your password", url: appUrl(`/accept-invite/${token}`) },
  });
  return token;
}

async function consumeToken(token: string, purpose: "INVITE" | "PASSWORD_RESET") {
  const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) return null;
  return row;
}

export async function peekToken(token: string, purpose: "INVITE" | "PASSWORD_RESET") {
  const row = await consumeToken(token, purpose);
  return row ? { name: row.user.name, email: row.user.email } : null;
}

export async function completeTokenPassword(token: string, purpose: "INVITE" | "PASSWORD_RESET", password: string): Promise<void> {
  const row = await consumeToken(token, purpose);
  if (!row) throw new RuleError("This link has expired or was already used. Ask for a new one.");
  const problem = await passwordProblem(password, row.user.email);
  if (problem) throw new RuleError(problem);
  await db.$transaction(async (tx) => {
    await tx.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await tx.user.update({
      where: { id: row.userId },
      data: {
        passwordHash: await hashPassword(password),
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        sessionVersion: { increment: 1 },
        // An invited person moves to ONBOARDING until their contract pack is signed.
        ...(row.user.status === "INVITED" ? { status: "ONBOARDING" as const } : {}),
      },
    });
    await tx.userSession.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, { actorId: row.userId, action: purpose === "INVITE" ? "auth.invite.accept" : "auth.password.reset", entityType: "User", entityId: row.userId });
  });
}

/** Always behaves the same whether or not the email exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.status === "EXITED" || user.status === "SUSPENDED" || user.status === "INVITED") return;
  const token = newToken();
  await db.authToken.create({ data: { userId: user.id, purpose: "PASSWORD_RESET", tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
  await sendEmail({
    to: user.email,
    subject: "Reset your Figuraid OS password",
    text: "Someone asked to reset your Figuraid OS password. If it was you, use the link below within an hour. If not, you can ignore this email.",
    template: "password_reset",
    cta: { label: "Reset password", url: appUrl(`/reset-password/${token}`) },
  });
}
