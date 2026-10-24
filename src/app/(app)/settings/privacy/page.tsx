import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DsrQueue, PolicyAdmin } from "@/components/settings/privacy-admin";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listDsrs, listPolicies, listRetention } from "@/server/modules/privacy/service";
import { Card, CardHeader } from "@/ui/card";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Privacy & data" };

const ENTITY: Record<string, string> = { contact_lead: "Leads with no activity", exited_staff: "Exited staff records", ai_interaction: "AI assistant logs", webhook_event: "Webhook payloads", login_attempt: "Sign-in attempts" };

export default async function PrivacySettingsPage() {
  const ctx = await requireCtx();
  const seeDsr = can(ctx, "privacy.dsr", "VIEW");
  const seeSettings = can(ctx, "settings", "VIEW");
  if (!seeDsr && !seeSettings) notFound();
  const [dsrs, policies, retention] = await Promise.all([seeDsr ? listDsrs(ctx) : [], seeSettings ? listPolicies(ctx) : [], seeSettings ? listRetention(ctx) : []]);
  return (
    <div className="grid gap-4">
      {seeDsr && <DsrQueue rows={dsrs} canEdit={can(ctx, "privacy.dsr", "EDIT")} />}
      {seeSettings && <PolicyAdmin policies={policies} canEdit={can(ctx, "settings", "EDIT")} />}
      {seeSettings && (
        <Card>
          <CardHeader title="Retention" description="Applied every night. Financial records are kept for 6 years regardless, as tax law requires." />
          {retention.length === 0 ? <p className="text-[13px] text-ink-3">No rules yet.</p> : (
            <ul className="grid gap-1.5 text-[13px]">
              {retention.map((r) => <li key={r.id} className="flex justify-between gap-3"><span>{ENTITY[r.entity] ?? r.entity}</span><span className="text-ink-3">{r.action} after {r.afterDays} days{r.lastRunAt && ` · last run ${formatDateTime(r.lastRunAt.toISOString())}`}</span></li>)}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
