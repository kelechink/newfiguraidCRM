import "server-only";
import type { UnitCode } from "@prisma/client";
import { cookies } from "next/headers";
import { cache } from "react";
import { db } from "@/server/db";

export const UNIT_COOKIE = "fos_unit";
export const UNIT_CODES: readonly UnitCode[] = ["ACADEMY", "FIGUREWEB", "TELECOM", "HQ"];

export interface UnitOption {
  id: string;
  code: UnitCode;
  name: string;
  accentColor: string;
}

export const listUnits = cache(async (): Promise<UnitOption[]> => {
  const units = await db.businessUnit.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, accentColor: true },
  });
  return UNIT_CODES.flatMap((c) => units.filter((u) => u.code === c));
});

/** The unit switcher's current choice. A view filter only — permissions are applied separately. */
export const currentUnit = cache(async (): Promise<UnitOption | null> => {
  const code = (await cookies()).get(UNIT_COOKIE)?.value;
  if (!code) return null;
  return (await listUnits()).find((u) => u.code === code) ?? null;
});
