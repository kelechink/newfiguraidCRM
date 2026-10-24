import type { Metadata } from "next";
import { GeneralSettings } from "@/components/settings/general-settings";
import { can, requireScope } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listOffices } from "@/server/modules/attendance/service";
import { allSettings, listHolidays } from "@/server/modules/settings/service";

export const metadata: Metadata = { title: "Units, offices & rules" };

export default async function GeneralSettingsPage() {
  const ctx = await requireCtx();
  requireScope(ctx, "settings", "VIEW");
  const [offices, settings, holidays] = await Promise.all([listOffices(), allSettings(), listHolidays()]);
  return <GeneralSettings offices={offices} settings={settings} holidays={holidays} canEdit={can(ctx, "settings", "EDIT")} />;
}
