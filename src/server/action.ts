import "server-only";
import { ZodError } from "zod";
import type { Ctx } from "@/server/authz/context";
import { ForbiddenError, NotFoundError, ReauthRequiredError, RuleError } from "@/server/authz/errors";
import { getCtx } from "@/server/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; fields?: Record<string, string>; reauth?: boolean };

/**
 * Runs a service call for a server action: authenticates, then maps known
 * errors to safe messages. Unknown errors are logged server-side and never
 * reach the browser (no stack traces — Security #18).
 */
export async function runAction<T>(fn: (ctx: Ctx) => Promise<T>): Promise<ActionResult<T>> {
  const ctx = await getCtx();
  if (!ctx) return { ok: false, error: "Your session has ended. Please sign in again." };
  try {
    return { ok: true, data: await fn(ctx) };
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: "You don't have access to do that." };
    if (e instanceof NotFoundError) return { ok: false, error: "That item no longer exists or isn't available to you." };
    if (e instanceof RuleError) return { ok: false, error: e.message };
    if (e instanceof ReauthRequiredError) return { ok: false, error: e.message, reauth: true };
    if (e instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of e.issues) fields[issue.path.join(".")] ??= issue.message;
      return { ok: false, error: e.issues[0]?.message ?? "Please check the form", fields };
    }
    console.error("[action] unexpected error", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
