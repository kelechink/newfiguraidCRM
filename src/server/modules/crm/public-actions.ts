"use server";

import { z } from "zod";
import { RuleError } from "@/server/authz/errors";
import { rateLimit, requestIp, requestUserAgent } from "@/server/ratelimit";
import { verifyTurnstile } from "@/server/turnstile";
import { submitForm } from "./forms-service";

const Input = z.object({
  slug: z.string().max(60),
  values: z.record(z.string().max(60), z.string().max(4000)),
  consent: z.boolean(),
  utm: z.object({ source: z.string().max(100).optional(), medium: z.string().max(100).optional(), campaign: z.string().max(100).optional(), content: z.string().max(100).optional() }),
  ref: z.string().max(40).nullable().optional(),
  turnstile: z.string().max(4096).nullable().optional(),
  website: z.string().max(200).optional(), // honeypot: real people never fill this
});

export async function submitFormAction(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const ip = await requestIp();
  if (!rateLimit(`form:${ip}`, 8, 10 * 60_000)) return { ok: false, error: "Too many submissions. Please try again in a few minutes." };
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check the form." };
  const input = parsed.data;
  if (input.website) return { ok: true }; // bot — pretend success
  if (!(await verifyTurnstile(input.turnstile, ip))) return { ok: false, error: "Please complete the security check." };
  try {
    await submitForm(input.slug, input.values, input.consent, { ip, userAgent: await requestUserAgent(), utm: input.utm, ref: input.ref ?? null });
    return { ok: true };
  } catch (e) {
    if (e instanceof RuleError) return { ok: false, error: e.message };
    console.error("[form]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
