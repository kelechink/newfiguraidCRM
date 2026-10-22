import "server-only";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/server/db";
import { dummyHash, verifyPassword } from "./password";

export const SESSION_MAX_AGE_S = 8 * 60 * 60; // absolute lifetime (Security #10)
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const Credentials = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) });

function clientIp(headers: Record<string, unknown> | undefined): string | null {
  const fwd = headers?.["x-forwarded-for"];
  return typeof fwd === "string" ? (fwd.split(",")[0]?.trim() ?? null) : null;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_S },
  pages: { signIn: "/login" },
  // NextAuth sets Secure/HttpOnly/SameSite=Lax cookies (with __Secure- prefix over HTTPS).
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(raw, req) {
        const parsed = Credentials.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        const ip = clientIp(req?.headers);
        const userAgent = typeof req?.headers?.["user-agent"] === "string" ? req.headers["user-agent"] : null;

        const user = await db.user.findUnique({ where: { email } });
        const fail = async (reason: string) => {
          await db.loginAttempt.create({ data: { email, ip, success: false, reason } });
          return null;
        };

        if (!user || !user.passwordHash) {
          await verifyPassword(await dummyHash(), parsed.data.password); // equalise timing
          return fail("unknown_or_no_password");
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) return fail("locked");
        if (user.status === "SUSPENDED" || user.status === "EXITED" || user.status === "INVITED") return fail("inactive");
        if (user.accessExpiresAt && user.accessExpiresAt < new Date()) return fail("access_expired");

        if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
          const failures = user.failedLoginCount + 1;
          await db.user.update({
            where: { id: user.id },
            data: failures >= MAX_FAILURES
              ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MS) }
              : { failedLoginCount: failures },
          });
          return fail(failures >= MAX_FAILURES ? "bad_password_locked" : "bad_password");
        }

        // TODO(step 3a): TOTP challenge here when the role requires 2FA.
        const session = await db.userSession.create({
          data: { userId: user.id, ip, userAgent, expiresAt: new Date(Date.now() + SESSION_MAX_AGE_S * 1000) },
        });
        await db.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
        await db.loginAttempt.create({ data: { email, ip, success: true } });
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
    session({ session, token }) {
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
