"use client";

import { ChevronLeft, ChevronRight, Flag, MessageSquareWarning } from "lucide-react";
import { useEffect, useState } from "react";
import { formatTime } from "@/lib/format";
import { monthCalendarAction, submitExcuseAction } from "@/server/modules/attendance/actions";
import type { CalendarDay } from "@/server/modules/attendance/service";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Textarea } from "@/ui/field";
import { useAction } from "@/ui/use-action";

const TONE: Record<string, string> = {
  PRESENT: "bg-success/12 text-success border-success/25",
  LATE: "bg-warning/12 text-warning border-warning/30",
  ABSENT: "bg-danger/10 text-danger border-danger/25",
  ON_LEAVE: "bg-accent-soft text-accent-ink border-accent/20",
  HOLIDAY: "bg-surface-3 text-ink-2 border-line",
  WEEKEND: "bg-transparent text-ink-3 border-transparent",
  PENDING: "bg-surface text-ink-2 border-line",
  FUTURE: "bg-transparent text-ink-3/60 border-transparent",
  NONE: "bg-transparent text-ink-3/60 border-transparent",
};
const LABEL: Record<string, string> = { PRESENT: "Present", LATE: "Late", ABSENT: "Absent", ON_LEAVE: "Leave", HOLIDAY: "Holiday", PENDING: "Today" };

function shift(month: string, by: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

export function MonthCalendar({ initialMonth, userId, self }: { initialMonth: string; userId?: string; self: boolean }) {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<{ user: { name: string }; days: CalendarDay[] } | null>(null);
  const [excuseFor, setExcuseFor] = useState<CalendarDay | null>(null);
  const excuse = useAction(submitExcuseAction, { success: "Excuse sent to your manager", refresh: false, onSuccess: () => setExcuseFor(null) });

  useEffect(() => {
    setData(null);
    void monthCalendarAction({ month, userId }).then((r) => r.ok && setData(r.data));
  }, [month, userId, excuse.pending]);

  const days = data?.days ?? [];
  const lead = days.length ? (new Date(`${days[0]!.date}T12:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const count = (s: string) => days.filter((d) => d.status === s).length;
  const lateMin = days.reduce((n, d) => n + d.minutesLate, 0);
  const title = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T00:00:00Z`));

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {!self && data && <span className="text-[13px] text-ink-3">{data.user.name}</span>}
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => setMonth(shift(month, -1))} aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMonth(shift(month, 1))} aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ["Present", count("PRESENT") + count("LATE"), ""],
          ["Late", count("LATE"), "text-warning"],
          ["Minutes late", lateMin, "text-warning"],
          ["Absent", count("ABSENT"), "text-danger"],
          ["On leave", count("ON_LEAVE"), ""],
        ].map(([l, v, c]) => (
          <div key={String(l)} className="rounded-lg border border-line px-3 py-2">
            <p className="text-2xs text-ink-3">{l}</p>
            <p className={cn("text-[18px] font-semibold tabular", c as string)}>{v}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-2xs font-medium text-ink-3">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="pb-1">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} />
        ))}
        {!data
          ? Array.from({ length: 30 }, (_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-2" />)
          : days.map((d) => {
              const canExcuse = self && (d.status === "LATE" || d.status === "ABSENT" || d.flagged) && !d.excuse;
              return (
                <button
                  key={d.date}
                  type="button"
                  disabled={!canExcuse}
                  onClick={() => setExcuseFor(d)}
                  title={canExcuse ? "Submit an excuse" : undefined}
                  className={cn("relative flex h-16 flex-col items-start rounded-lg border p-1.5 text-left transition-colors sm:h-20", TONE[d.status] ?? TONE.NONE, canExcuse && "hover:ring-2 hover:ring-accent/40")}
                >
                  <span className="text-[12px] font-semibold tabular">{Number(d.date.slice(8))}</span>
                  {LABEL[d.status] && <span className="mt-auto hidden text-[10.5px] font-medium sm:block">{LABEL[d.status]}{d.minutesLate ? ` · ${d.minutesLate}m` : ""}</span>}
                  {d.status === "LATE" && <span className="mt-auto text-[10px] font-medium tabular sm:hidden">{d.minutesLate}m</span>}
                  {d.firstInAt && <span className="hidden text-[10px] tabular opacity-80 sm:block">{formatTime(new Date(d.firstInAt))}</span>}
                  {d.flagged && <Flag className="absolute right-1 top-1 size-3 text-warning" aria-label="Flagged" />}
                  {d.excuse && <MessageSquareWarning className={cn("absolute right-1 top-1 size-3", d.excuse === "APPROVED" ? "text-success" : d.excuse === "REJECTED" ? "text-danger" : "text-accent")} aria-label={`Excuse ${d.excuse.toLowerCase()}`} />}
                </button>
              );
            })}
      </div>
      {self && <p className="mt-3 text-2xs text-ink-3">Tap a late, absent or flagged day to submit an excuse. Your manager decides before payroll closes.</p>}

      <Dialog open={!!excuseFor} onOpenChange={(o) => !o && setExcuseFor(null)}>
        {excuseFor && (
          <DialogContent
            title={`Excuse for ${excuseFor.date}`}
            description={excuseFor.status === "LATE" ? `${excuseFor.minutesLate} minutes late` : excuseFor.status === "ABSENT" ? "Marked absent" : "Flagged clock-in"}
            footer={
              <>
                <Button variant="ghost" onClick={() => setExcuseFor(null)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" form="excuse" loading={excuse.pending}>
                  Send to manager
                </Button>
              </>
            }
          >
            <form id="excuse" action={excuse.formAction((f) => ({ date: excuseFor.date, reason: f.get("reason") }))}>
              <Field label="What happened?" htmlFor="ex-reason" error={excuse.errors.reason}>
                <Textarea id="ex-reason" name="reason" required minLength={5} maxLength={1000} placeholder="e.g. Hospital appointment — receipt available" />
              </Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
