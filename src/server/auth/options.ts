import "server-only";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { audit } from "@/server/audit/audit";
import { decrypt } from "@/server/crypto/field";
import { sha256 } from "@/server/crypto/tokens";
import { verifyTotp } from "@/server/crypto/totp";
import { db } from "@/server/db";
import { notify } from "@/server/notify/notify";
import { dummyHash, verifyPassword } from "./password";

export const SESSION_MAX_AGE_S = 8 * 60 * 60; // absolute lifetime (Security #10)
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX_FAILURES = 30; // per IP across all accounts: slows credential stuffing

/** Thrown (not returned) so the login form can show the code step. Only after a correct password. */
export const TOTP_REQUIRED = "TOTP_REQUIRED";

const Credentials = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(256),
  code: z.string().max(20).optional(),
});

function clientIp(headers: Record<string, unknown> | undefined): string | null {
  const fwd = headers?.["x-forwarded-for"] ?? headers?.["x-real-ip"];
  return typeof fwd === "string" ? (fwd.split(",")[0]?.trim() ?? null) : null;
}

/** Second factor: a TOTP code, or a one-time recovery code. Returns false on mismatch. */
async function checkSecondFactor(user: { id: string; totpSecretEnc: string | null; totpLastCounter: number | null }, code: string): Promise<boolean> {
  if (!user.totpSecretEnc) return false;
  const counter = verifyTotp(decrypt(user.totpSecretEnc), code, user.totpLastCounter);
  if (counter !== null) {
    await db.user.update({ where: { id: user.id }, data: { totpLastCounter: counter } });
    return true;
  }
  const recovery = await db.recoveryCode.findFirst({
    where: { userId: user.id, usedAt: null, codeHash: sha256(code.trim().toUpperCase()) },
  });
  if (!recovery) return false;
  await db.recoveryCode.update({ where: { id: recovery.id }, data: { usedAt: new Date() } });
  return true;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_S },
  pages: { signIn: "/login" },
  // NextAuth sets Secure/HttpOnly/SameSite=Lax cookies (with __Secure- prefix over HTTPS).
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: { email: { type: "email" }, password: { type: "password" }, code: { type: "text" } },
      async authorize(raw, req) {
        const parsed = Credentials.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        const ip = clientIp(req?.headers);
        const userAgent = typeof req?.headers?.["user-agent"] === "string" ? req.headers["user-agent"] : null;
        const fail = async (reason: string) => {
          await db.loginAttempt.create({ data: { email, ip, success: false, reason } });
          return null;
        };

        if (ip && (await db.loginAttempt.count({ where: { ip, success: false, createdAt: { gt: new Date(Date.now() - IP_WINDOW_MS) } } })) >= IP_MAX_FAILURES) {
          return fail("ip_rate_limited");
        }

        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) {
          await verifyPassword(await dummyHash(), parsed.data.password); // equalise timing
          return fail("unknown_or_no_password");
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) return fail("locked");
        if (user.status === "SUSPENDED" || user.status === "EXITED" || user.status === "INVITED") return fail("inactive");
        if (user.accessExpiresAt && user.accessExpiresAt < new Date()) return fail("access_expired");

        const registerFailure = async (reason: string) => {
          const failures = user.failedLoginCount + 1;
          const locked = failures >= MAX_FAILURES;
          await db.user.update({
            where: { id: user.id },
            data: locked ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) } : { failedLoginCount: failures },
          });
          if (locked) {
            await notify({
              userIds: [user.id],
              type: "security.locked",
              title: "Your Figuraid OS account was locked",
              body: "Five failed sign-in attempts. It unlocks in 15 minutes. If this wasn't you, tell the Super Admin.",
              email: true,
            });
          }
          return fail(locked ? `${reason}_locked` : reason);
        };

        if (!(await verifyPassword(user.passwordHash, parsed.data.password))) return registerFailure("bad_password");

        if (user.twoFactorEnabledAt) {
          if (!parsed.data.code) throw new Error(TOTP_REQUIRED);
          if (!(await checkSecondFactor(user, parsed.data.code))) return registerFailure("bad_totp");
        }

        // New-device alert (Security #1): first login from this browser/IP combination.
        const seen = await db.userSession.findFirst({ where: { userId: user.id, userAgent, ip }, select: { id: true } });
        const priorSessions = await db.userSession.count({ where: { userId: user.id } });

        const session = await db.userSession.create({
          data: { userId: user.id, ip, userAgent, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_S * 1000) },
        });
        await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
        await db.loginAttempt.create({ data: { email, ip, success: true } });
        await db.$transaction((tx) => audit(tx, { actorId: user.id, action: "auth.login", entityType: "UserSession", entityId: session.id, after: { ip, userAgent } }));
        if (!seen && priorSessions > 0) {
          await notify({
            userIds: [user.id],
            type: "security.new_device",
            title: "New sign-in to Figuraid OS",
            body: `A new device signed in${ip ? ` from ${ip}` : ""}. If this wasn't you, change your password and sign out everywhere from Account → Security.`,
            link: "/account/security",
            email: true,
          });
        }
        return { id: user.id, email: user.email, name: user.name, sid: session.id, sv: user.sessionVersion };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const u = user as unknown as { id: string; sid: string; sv: number };
        token.sub = u.id;
        token.sid = u.sid;
        token.sv = u.sv;
      }
      return token;
    },
    session({ session }) {
      // Only non-sensitive identity reaches the browser; permissions are resolved server-side per request.
      session.user = { name: session.user?.name, email: session.user?.email };
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      if (token?.sid) await db.userSession.updateMany({ where: { id: token.sid as string }, data: { revokedAt: new Date() } });
    },
  },
};
