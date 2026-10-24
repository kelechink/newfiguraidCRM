"use server";

import { z } from "zod";
import { runAction, type ActionResult } from "@/server/action";
import { RuleError } from "@/server/authz/errors";
import { rateLimit, requestIp, requestUserAgent } from "@/server/ratelimit";
import {
  acceptPolicy,
  changePassword,
  completeTokenPassword,
  confirmTotpEnrollment,
  disableTotp,
  reauthenticate,
  requestPasswordReset,
  revokeSession,
  signOutEverywhere,
  startTotpEnrollment,
} from "./service";

export async function startTotpAction() {
  return runAction((ctx) => startTotpEnrollment(ctx));
}
export async function confirmTotpAction(input: unknown) {
  return runAction((ctx) => confirmTotpEnrollment(ctx, input));
}
export async function disableTotpAction(input: unknown) {
  return runAction((ctx) => disableTotp(ctx, input));
}
export async function changePasswordAction(input: unknown) {
  return runAction((ctx) => changePassword(ctx, input));
}
export async function revokeSessionAction(id: string) {
  return runAction((ctx) => revokeSession(ctx, String(id)));
}
export async function signOutEverywhereAction() {
  return runAction((ctx) => signOutEverywhere(ctx.userId, ctx.userId));
}
export async function reauthAction(input: unknown) {
  return runAction((ctx) => reauthenticate(ctx, input));
}
export async function acceptPolicyAction(policyId: string) {
  const ip = await requestIp();
  const ua = await requestUserAgent();
  return runAction((ctx) => acceptPolicy(ctx, String(policyId), ip, ua));
}

// ── public (no session) ──

async function publicAction<T>(key: string, limit: number, fn: () => Promise<T>): Promise<ActionResult<T>> {
  const ip = await requestIp();
  if (!rateLimit(`${key}:${ip}`, limit, 15 * 60_000)) return { ok: false, error: "Too many attempts. Please wait a few minutes." };
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Please check the form" };
    console.error("[public action]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function requestResetAction(email: string) {
  return publicAction("reset", 5, async () => {
    await requestPasswordReset(z.string().email().parse(email));
    return true;
  });
}

export async function completePasswordAction(input: { token: string; purpose: "INVITE" | "PASSWORD_RESET"; password: string }) {
  return publicAction("token-password", 10, () =>
    completeTokenPassword(String(input.token), input.purpose === "INVITE" ? "INVITE" : "PASSWORD_RESET", String(input.password)),
  );
}
