"use client";

import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { money, num } from "@/lib/format";
import { deleteTargetAction, generateTargetTasksAction, setTargetAction } from "@/server/modules/targets/actions";
import type { TargetRow } from "@/server/modules/targets/service";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { UNIT_STYLE } from "@/ui/units";
import { useAction } from "@/ui/use-action";
import { Progress } from "./progress";

type Row = {
  user: { id: string; name: string; unit: string | null; role: string };
  targets: TargetRow[];
  targetPct: number | null;
  tasksDue: number;
  onTimeRate: number | null;
  overdueOpen: number;
  reports: number;
  avgResponseMin: number | null;
};

const METRICS: [string, string][] = [
  ["LEADS_CONTACTED", "Leads contacted"],
  ["DEALS_CLOSED", "Deals closed"],
  ["REVENUE", "Revenue collected (₦)"],
  ["MINUTES_SOLD", "Telecom minutes sold"],
  ["TICKETS_RESOLVED", "Tickets resolved"],
  ["CONVERSATIONS_HANDLED", "Conversations resolved"],
  ["STUDENTS_ENROLLED", "Students enrolled"],
  ["CUSTOM", "Custom…"],
];

export function TeamScorecards({ rows, weekStart, canSet }: { rows: Row[]; weekStart: string; canSet: boolean }) {
  const [setting, setSetting] = useState<Row["user"] | null>(null);
  const [metric, setMetric] = useState("LEADS_CONTACTED");
  const set = useAction(setTargetAction, { success: "Target set", onSuccess: () => setSetting(null) });
  const del = useAction(deleteTargetAction, { success: "Target removed" });
  const plan = useAction(generateTargetTasksAction, { success: (r) => (r.created ? `${r.created} daily task${r.created === 1 ? "" : "s"} added to boards` : "Today's target tasks already exist") });
  const tone = (v: number | null, good: number, ok: number) => (v === null ? "text-ink-3" : v >= good ? "text-success" : v >= ok ? "text-warning" : "text-danger");

  return (
    <div className="grid gap-4">
      {canSet && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-ink-3">Each morning, today&rsquo;s share of every target becomes a task on the person&rsquo;s board.</p>
          <Button variant="secondary" onClick={() => plan.run({})} loading={plan.pending}>
            <Sparkles className="size-3.5" /> Plan today from targets
          </Button>
        </div>
      )}
      <Card padded={false}>
        <Table>
          <THead>
            <tr>
              <Th>Person</Th>
              <Th>Targets</Th>
              <Th align="right">Achieved</Th>
              <Th align="right">On-time tasks</Th>
              <Th align="right">Overdue</Th>
              <Th align="right">Reports</Th>
              <Th align="right">Avg reply</Th>
              {canSet && <Th />}
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={8}>No one in your scope.</TableEmpty>}
            {rows.map((r) => (
              <Tr key={r.user.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar id={r.user.id} name={r.user.name} size={26} />
                    <div>
                      <p className="font-medium">{r.user.name}</p>
                      <p className="flex items-center gap-1 text-2xs text-ink-3">
                        {r.user.unit && <span className={cn("size-1.5 rounded-full", UNIT_STYLE[r.user.unit]?.dot)} />}
                        {r.user.role}
                      </p>
                    </div>
                  </div>
                </Td>
                <Td className="min-w-[240px]">
                  {r.targets.length === 0 ? (
                    <span className="text-ink-3">—</span>
                  ) : (
                    <ul className="grid gap-1.5 py-1.5">
                      {r.targets.map((t) => (
                        <li key={t.id} className="group grid grid-cols-[1fr_auto] items-center gap-x-2">
                          <span className="truncate text-[12px]">{t.label}</span>
                          <span className="flex items-center gap-1 text-2xs tabular text-ink-3">
                            {t.metric === "REVENUE" ? money(t.achieved, "NGN", { compact: true }) : num(t.achieved)} / {t.metric === "REVENUE" ? money(t.targetValue, "NGN", { compact: true }) : num(t.targetValue)}
                            {canSet && (
                              <button onClick={() => del.run(t.id)} className="hidden rounded p-0.5 hover:text-danger group-hover:inline" aria-label={`Remove ${t.label}`}>
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </span>
                          <Progress pct={t.pct} className="col-span-2" />
                        </li>
                      ))}
                    </ul>
                  )}
                </Td>
                <Td align="right" className={cn("font-semibold", tone(r.targetPct, 100, 60))}>{r.targetPct === null ? "—" : `${r.targetPct}%`}</Td>
                <Td align="right" className={tone(r.onTimeRate, 85, 60)}>{r.onTimeRate === null ? "—" : `${r.onTimeRate}%`}<span className="ml-1 text-2xs text-ink-3">of {r.tasksDue}</span></Td>
                <Td align="right" className={r.overdueOpen ? "text-danger" : "text-ink-3"}>{r.overdueOpen}</Td>
                <Td align="right" className={tone(r.reports, 5, 3)}>{r.reports}/5</Td>
                <Td align="right" muted>{r.avgResponseMin === null ? "—" : `${r.avgResponseMin}m`}</Td>
                {canSet && (
                  <Td align="right">
                    <Button size="sm" variant="ghost" onClick={() => setSetting(r.user)}>
                      <Plus className="size-3" /> Target
                    </Button>
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Dialog open={!!setting} onOpenChange={(o) => !o && setSetting(null)}>
        {setting && (
          <DialogContent
            title={`Target for ${setting.name}`}
            description="Achievement is measured automatically. A bonus is added to payroll if they hit it."
            footer={<><Button variant="ghost" onClick={() => setSetting(null)}>Cancel</Button><Button variant="primary" type="submit" form="tgt" loading={set.pending}>Set target</Button></>}
          >
            <form
              id="tgt"
              className="grid gap-4"
              action={set.formAction((f) => ({ userId: setting.id, weekStart, metric, label: f.get("label") || undefined, targetValue: f.get("value"), bonusAmount: f.get("bonus") ? Number(f.get("bonus")) : null }))}
            >
              <Field label="Measure" htmlFor="t-metric">
                <Select id="t-metric" value={metric} onChange={(e) => setMetric(e.target.value)}>
                  {METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
              {metric === "CUSTOM" && <Field label="Name" htmlFor="t-label"><Input id="t-label" name="label" required placeholder="e.g. Rate decks sent" maxLength={80} /></Field>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Target this week" htmlFor="t-value" error={set.errors.targetValue}><Input id="t-value" name="value" type="number" min={1} step="any" required /></Field>
                <Field label="Bonus if hit (₦, optional)" htmlFor="t-bonus"><Input id="t-bonus" name="bonus" type="number" min={0} step="1000" /></Field>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
