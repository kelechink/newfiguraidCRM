"use server";

import { z } from "zod";
import { RuleError } from "@/server/authz/errors";
import { rateLimit, requestIp, requestUserAgent } from "@/server/ratelimit";
import { verifyTurnstile } from "@/server/turnstile";
import { submitDsr } from "@/server/modules/privacy/service";
import { submitCsat } from "@/server/modules/support/service";
import { signByToken } from "@/server/modules/vault/service";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

async function guarded<T>(key: string, limit: number, fn: () => Promise<T>): Promise<Result<T>> {
  const ip = await requestIp();
  if (!rateLimit(`${key}:${ip}`, limit, 15 * 60_000)) return { ok: false, error: "Too many attempts. Please try again later." };
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Please check your answers." };
    console.error(`[${key}]`, e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function signExternalAction(raw: unknown) {
  return guarded("sign", 10, async () => signByToken(raw, { ip: await requestIp(), userAgent: await requestUserAgent() }));
}

export async function csatAction(raw: unknown) {
  return guarded("csat", 10, () => submitCsat(raw));
}

export async function dsrAction(raw: unknown) {
  const input = z.object({ turnstile: z.string().max(4096).nullable().optional(), website: z.string().max(200).optional() }).passthrough().safeParse(raw);
  if (!input.success) return { ok: false as const, error: "Please check your answers." };
  if (input.data.website) return { ok: true as const, data: { reference: "RECEIVED" } }; // honeypot
  return guarded("dsr", 3, async () => {
    if (!(await verifyTurnstile(input.data.turnstile, await requestIp()))) throw new RuleError("Please complete the security check.");
    return submitDsr(raw);
  });
}
