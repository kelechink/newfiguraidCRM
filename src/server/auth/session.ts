import "server-only";
import { cookies, headers } from "next/headers";
import { decode } from "next-auth/jwt";
import { redirect } from "next/navigation";
import { cache } from "react";
import { loadCtx, type Ctx } from "@/server/authz/context";
import { db } from "@/server/db";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const TOUCH_EVERY_MS = 60 * 1000;

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
    session.user.status === "EXITED"
  ) {
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
    await db.userSession.update({ where: { id: sid }, data: { lastSeenAt: new Date() } });
  }
  void (await headers()); // opt the caller into dynamic rendering
  return loadCtx(session.userId);
});

/** For pages: the caller, or a redirect to sign-in. */
export async function requireCtx(): Promise<Ctx> {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  return ctx;
}
