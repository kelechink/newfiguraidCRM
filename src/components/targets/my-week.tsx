"use client";

import { Target } from "lucide-react";
import { formatDay, money, num } from "@/lib/format";
import { submitReportAction, updateCustomAchievedAction } from "@/server/modules/targets/actions";
import type { TargetRow } from "@/server/modules/targets/service";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { EmptyState } from "@/ui/empty-state";
import { Field, Input, Textarea } from "@/ui/field";
import { useAction } from "@/ui/use-action";
import { Progress } from "./progress";

const fmt = (t: TargetRow, v: number) => (t.metric === "REVENUE" ? money(v, "NGN", { compact: true }) : num(v));

export function MyWeek({ weekStart, targets, reports, today }: { weekStart: string; targets: TargetRow[]; reports: { date: string; accomplished: string; blockers: string | null; tomorrow: string | null }[]; today: string }) {
  const report = useAction(submitReportAction, { success: "End-of-day report filed" });
  const custom = useAction(updateCustomAchievedAction, { success: "Updated" });
  const filedToday = reports.find((r) => r.date === today);
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
      <Card>
        <CardHeader title={`Week of ${formatDay(weekStart, { weekday: true })}`} description="Achievement updates automatically from your deals, messages, payments and minutes." />
        {targets.length === 0 ? (
          <EmptyState icon={<Target className="size-5" />} title="No targets this week" body="Your manager sets weekly targets. Your daily tasks are worked out from them." />
        ) : (
          <ul className="grid gap-4">
            {targets.map((t) => (
              <li key={t.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <p className="text-[13.5px] font-medium">{t.label}</p>
                  <p className="text-[13px] tabular">
                    <span className="font-semibold">{fmt(t, t.achieved)}</span> <span className="text-ink-3">/ {fmt(t, t.targetValue)}</span>
                  </p>
                </div>
                <Progress pct={t.pct} />
                <div className="mt-1 flex items-center justify-between text-2xs text-ink-3">
                  <span>Set by {t.setBy}{t.bonusAmount ? ` · bonus ${money(t.bonusAmount)} if hit` : ""}</span>
                  <span className="tabular">{t.pct}%</span>
                </div>
                {t.metric === "CUSTOM" && (
                  <form className="mt-2 flex items-end gap-2" action={custom.formAction((f) => ({ targetId: t.id, achieved: f.get("v") }))}>
                    <Input name="v" type="number" min={0} defaultValue={t.achieved} className="h-7 w-28 text-right tabular" aria-label="Achieved so far" />
                    <Button size="sm" variant="ghost" type="submit">Update</Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="End-of-day report" description={filedToday ? "Filed for today — you can still edit it." : "Two minutes before you leave. Blockers go straight to your manager."} />
        <form className="grid gap-3" action={report.formAction((f) => ({ accomplished: f.get("done"), blockers: f.get("blockers") || undefined, tomorrow: f.get("tomorrow") || undefined }))}>
          <Field label="What did you get done?" htmlFor="r-done" error={report.errors.accomplished}>
            <Textarea id="r-done" name="done" required defaultValue={filedToday?.accomplished} placeholder="e.g. Closed 2 hosting renewals, quoted Uyo hotel email, cleared 14 inbox conversations" />
          </Field>
          <Field label="Blockers" htmlFor="r-block">
            <Textarea id="r-block" name="blockers" defaultValue={filedToday?.blockers ?? ""} className="min-h-[52px]" placeholder="Anything stopping you?" />
          </Field>
          <Field label="Tomorrow" htmlFor="r-next">
            <Textarea id="r-next" name="tomorrow" defaultValue={filedToday?.tomorrow ?? ""} className="min-h-[52px]" />
          </Field>
          <Button type="submit" variant="primary" loading={report.pending}>{filedToday ? "Update report" : "File report"}</Button>
        </form>
        {reports.filter((r) => r.date !== today).length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-[0.05em] text-ink-3">Recent</p>
            <ul className="grid gap-2">
              {reports.filter((r) => r.date !== today).slice(0, 4).map((r) => (
                <li key={r.date} className="text-[12.5px]">
                  <span className="font-medium">{formatDay(r.date, { weekday: true })}</span> <span className="text-ink-2">— {r.accomplished.slice(0, 140)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
