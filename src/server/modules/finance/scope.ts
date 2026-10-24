import "server-only";
import type { Prisma } from "@prisma/client";
import type { PermAction } from "@/server/authz/catalog";
import { requireScope, scopeWhere, type Ctx } from "@/server/authz/context";

export const paymentWhere = (ctx: Ctx, a: PermAction) =>
  scopeWhere<Prisma.PaymentWhereInput>(ctx, requireScope(ctx, "finance.income", a), { unit: (ids) => ({ unitId: { in: ids } }), own: (me) => ({ recordedById: me }) });

export const expenseWhere = (ctx: Ctx, a: PermAction) =>
  scopeWhere<Prisma.ExpenseWhereInput>(ctx, requireScope(ctx, "finance.expenses", a), { unit: (ids) => ({ unitId: { in: ids } }), own: (me) => ({ submittedById: me }) });

export const invoiceWhere = (ctx: Ctx, a: PermAction) =>
  scopeWhere<Prisma.InvoiceWhereInput>(ctx, requireScope(ctx, "finance.invoices", a), { unit: (ids) => ({ unitId: { in: ids } }), own: (me) => ({ ownerId: me }) });

export const billWhere = (ctx: Ctx, a: PermAction) =>
  scopeWhere<Prisma.BillWhereInput>(ctx, requireScope(ctx, "finance.bills", a), { unit: (ids) => ({ unitId: { in: ids } }), own: (me) => ({ approvedById: me }) });

export const UNIT_PREFIX: Record<string, string> = { ACADEMY: "ACA", FIGUREWEB: "WEB", TELECOM: "TEL", HQ: "HQ" };
