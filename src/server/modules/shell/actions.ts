"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCtx } from "@/server/auth/session";
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
