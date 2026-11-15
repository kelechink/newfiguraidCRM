"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { RuleError } from "@/server/authz/errors";
import { rateLimit, requestIp, requestUserAgent } from "@/server/ratelimit";
import { verifyTurnstile } from "@/server/turnstile";
import { submitServiceRequest } from "./service";

const Envelope = z.object({
  turnstile: z.string().max(4096).nullable().optional(),
  website: z.string().max(200).optional(), // honeypot: people never fill this
  utm: z.record(z.string().max(40), z.string().max(100).optional()).default({}),
});

export async function requestServiceAction(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = await requestIp();
  if (!rateLimit(`site-request:${ip}`, 5, 10 * 60_000)) return { ok: false, error: "Too many requests from your network. Try again in a few minutes." };
  const env = Envelope.safeParse(raw);
  if (!env.success) return { ok: false, error: "Check the form and try again." };
  if (env.data.website) return { ok: true }; // bot: accept silently
  if (!(await verifyTurnstile(env.data.turnstile, ip))) return { ok: false, error: "Complete the security check, then send again." };
  try {
    await submitServiceRequest(raw, { ip, userAgent: await requestUserAgent(), utm: env.data.utm, ref: (await cookies()).get("fos_ref")?.value ?? null });
    return { ok: true };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: "Check the form and try again." };
    console.error("[site-request]", e);
    return { ok: false, error: "Your request didn't go through. Try again, or email us." };
  }
}
