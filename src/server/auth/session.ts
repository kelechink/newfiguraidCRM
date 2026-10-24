import "server-only";
import { cookies, headers } from "next/headers";
import { decode } from "next-auth/jwt";
import { redirect } from "next/navigation";
import { cache } from "react";
import { loadCtx, type Ctx } from "@/server/authz/context";
import { ReauthRequiredError } from "@/server/authz/errors";
import { db } from "@/server/db";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const TOUCH_EVERY_MS = 60 * 1000;
/** Finance and payroll actions need a password (and 2FA) entry within this window (Security #10). */
export const STEP_UP_WINDOW_MS = 15 * 60 * 1000;

async function readToken() {
  const jar = await cookies();
  const raw = jar.get("__Secure-next-auth.session-token")?.value ?? jar.get("next-auth.session-token")?.value;
  if (!raw) return null;
  return decode({ token: raw, secret: process.env.NEXTAUTH_SECRET! }).catch(() => null);
}

/**
 * The authenticated caller, or null. A valid JWT is not enough: the server-side
 * session must exist, be unrevoked, unexpired and not idle, and the user's
 * sessionVersion must match (bumped by "sign out everywhere" and on exit).
 */
export const getCtx = cache(async (): Promise<Ctx | null> => {
  const token = await readToken();
  const sid = token?.sid as string | undefined;
  if (!token?.sub || !sid) return null;

  const session = await db.userSession.findUnique({
    where: { id: sid },
    include: { user: { select: { id: true, sessionVersion: true, accessExpiresAt: true, status: true } } },
  });
  const now = Date.now();
  if (
    !session ||
    session.userId !== token.sub ||
    session.revokedAt ||
    session.expiresAt.getTime() < now ||
    now - session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS ||
    session.user.sessionVersion !== token.sv ||
    (session.user.accessExpiresAt && session.user.accessExpiresAt.getTime() < now) ||
    session.user.status === "SUSPENDED" ||
    session.user.status === "EXITED" ||
    session.user.status === "INVITED"
  ) {
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.userSession.update({ where: { id: sid }, data: { lastSeenAt: new Date() } });
  }
  return loadCtx(session.userId, sid);
});

export async function currentPath(): Promise<string> {
  return (await headers()).get("x-pathname") ?? "/";
}

/** Latest published staff privacy policy the user hasn't accepted, if any. */
export const pendingStaffPolicy = cache(async (userId: string) => {
  const policy = await db.policyDocument.findFirst({
    where: { kind: "STAFF_PRIVACY", publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    select: { id: true, version: true, title: true, body: true },
  });
  if (!policy) return null;
  const accepted = await db.policyAcceptance.findUnique({ where: { policyId_userId: { policyId: policy.id, userId } } });
  return accepted ? null : policy;
});

/**
 * For pages: the caller, or a redirect. Also enforces, in order:
 * 2FA enrolment for roles that require it, then acceptance of the staff privacy policy.
 */
export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  const path = await currentPath();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (ctx.requires2fa && !ctx.has2fa && !path.startsWith("/account/security")) redirect("/account/security?enroll=1");
  if (!path.startsWith("/account") && !path.startsWith("/welcome") && (await pendingStaffPolicy(ctx.userId))) redirect("/welcome");
  return ctx;
}

/** Step-up: throws unless the caller entered their password within the window. */
export async function requireRecentAuth(ctx: Ctx): Promise<void> {
  if (!ctx.sessionId) return; // background jobs and tests
  const s = await db.userSession.findUnique({ where: { id: ctx.sessionId }, select: { createdAt: true, reauthAt: true } });
  const last = Math.max(s?.createdAt.getTime() ?? 0, s?.reauthAt?.getTime() ?? 0);
  if (Date.now() - last > STEP_UP_WINDOW_MS) throw new ReauthRequiredError();
}

/** Page variant of requireRecentAuth: redirects to the re-auth screen and back. */
export async function requireRecentAuthPage(ctx: Ctx): Promise<void> {
  try {
    await requireRecentAuth(ctx);
  } catch {
    redirect(`/account/reauth?next=${encodeURIComponent(await currentPath())}`);
  }
}
