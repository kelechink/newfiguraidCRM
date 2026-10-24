"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { runAction } from "@/server/action";
import { getCtx } from "@/server/auth/session";
import { globalSearch } from "@/server/modules/search/service";
import { listNotifications, markNotificationsRead } from "./notifications";
import { UNIT_CODES, UNIT_COOKIE } from "./service";

export async function setUnitFilterAction(code: string | null) {
  if (!(await getCtx())) return;
  const jar = await cookies();
  if (code && (UNIT_CODES as readonly string[]).includes(code)) {
    jar.set(UNIT_COOKIE, code, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  } else {
    jar.delete(UNIT_COOKIE);
  }
  revalidatePath("/", "layout");
}

export async function listNotificationsAction() {
  return runAction((ctx) => listNotifications(ctx));
}

export async function markNotificationsReadAction(ids?: string[]) {
  return runAction((ctx) => markNotificationsRead(ctx, Array.isArray(ids) ? ids.map(String) : undefined));
}

export async function searchAction(q: string) {
  return runAction((ctx) => globalSearch(ctx, String(q ?? "")));
}
