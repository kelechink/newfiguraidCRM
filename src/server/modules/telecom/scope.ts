import "server-only";
import type { Prisma } from "@prisma/client";
import type { PermAction, PermModule } from "@/server/authz/catalog";
import { can, requireScope, type Ctx } from "@/server/authz/context";
import { db } from "@/server/db";

let telecomUnit: string | null = null;
export async function telecomUnitId(): Promise<string> {
  telecomUnit ??= (await db.businessUnit.findUniqueOrThrow({ where: { code: "TELECOM" }, select: { id: true } })).id;
  return telecomUnit;
}

/**
 * Carriers the caller may act on. Telecom lives in one unit, so UNIT scope means
 * "member of Telecom"; OWN means carriers they account-manage.
 */
export async function carrierWhere(ctx: Ctx, module: PermModule, action: PermAction): Promise<Prisma.CarrierWhereInput> {
  const scope = requireScope(ctx, module, action);
  if (scope === "ALL") return {};
  if (scope === "UNIT") return ctx.unitIds.includes(await telecomUnitId()) ? {} : { id: "__none__" };
  return { managerId: ctx.userId };
}

export async function accountWhere(ctx: Ctx, module: PermModule, action: PermAction): Promise<Prisma.CarrierAccountWhereInput> {
  return { carrier: await carrierWhere(ctx, module, action) };
}

/** Vendor buy rates and costs are sensitive (PRD §E); so are margins. */
export const canSeeBuy = (ctx: Ctx) => can(ctx, "telecom.buy_rates", "VIEW");
export const canSeeMargin = (ctx: Ctx) => can(ctx, "telecom.margins", "VIEW") && canSeeBuy(ctx);
