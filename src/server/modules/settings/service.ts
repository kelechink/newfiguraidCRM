import "server-only";
import { z } from "zod";
import { audit } from "@/server/audit/audit";
import { requireScope, type Ctx } from "@/server/authz/context";
import { RuleError } from "@/server/authz/errors";
import { db } from "@/server/db";

// Business rules stored in the Setting table, with defaults. Every change is audited.
export const SETTING_DEFAULTS = {
  "telecom.margin_alert_pct": 2,
  "finance.min_cash_balance_ngn": 5_000_000,
  "payroll.signoff_limit_ngn": 10_000_000,
  "finance.vat_rate_pct": 7.5,
  "finance.usd_ngn_rate": 1550,
  "inbox.sla_minutes": 15,
  "privacy.dsr_days": 30,
  "dpo.contact": "privacy@figuraid.com",
  "payroll.paye_enabled": 1, // 1 = deduct PAYE on payslips, 0 = off
  "payroll.pension_pct": 8, // employee contribution, Pension Reform Act 2014
  "payroll.nhf_pct": 0, // National Housing Fund (2.5% where it applies)
} as const;
export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSetting<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  return (row?.value as (typeof SETTING_DEFAULTS)[K]) ?? SETTING_DEFAULTS[key];
}

export async function allSettings() {
  const rows = await db.setting.findMany();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(Object.entries(SETTING_DEFAULTS).map(([k, v]) => [k, map[k] ?? v])) as Record<SettingKey, number | string>;
}

export async function saveSetting(ctx: Ctx, raw: unknown) {
  requireScope(ctx, "settings", "EDIT");
  const { key, value } = z.object({ key: z.enum(Object.keys(SETTING_DEFAULTS) as [SettingKey, ...SettingKey[]]), value: z.union([z.number(), z.string().max(200)]) }).parse(raw);
  if (typeof SETTING_DEFAULTS[key] === "number" && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) throw new RuleError("Enter a positive number");
  if (key === "payroll.signoff_limit_ngn" && !(await import("@/server/authz/context")).can(ctx, "roles", "EDIT")) throw new RuleError("Only the Super Admin can change the payroll sign-off limit");
  const before = await db.setting.findUnique({ where: { key } });
  await db.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
    await audit(tx, { actorId: ctx.userId, action: "setting.update", entityType: "Setting", entityId: key, before: before ? { value: before.value as never } : undefined, after: { value } });
  });
}

const HolidayInput = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().trim().min(2).max(80) });

export async function listHolidays() {
  const rows = await db.publicHoliday.findMany({ where: { date: { gte: new Date(new Date().getUTCFullYear() - 1 + "-01-01") } }, orderBy: { date: "asc" } });
  return rows.map((h) => ({ id: h.id, date: h.date.toISOString().slice(0, 10), name: h.name }));
}

export async function addHoliday(ctx: Ctx, raw: unknown) {
  requireScope(ctx, "settings", "EDIT");
  const h = HolidayInput.parse(raw);
  await db.publicHoliday.upsert({ where: { date: new Date(h.date) }, update: { name: h.name }, create: { date: new Date(h.date), name: h.name } });
}

export async function removeHoliday(ctx: Ctx, id: string) {
  requireScope(ctx, "settings", "EDIT");
  await db.publicHoliday.delete({ where: { id } });
}
