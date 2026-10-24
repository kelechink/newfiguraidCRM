import { Flag } from "lucide-react";
import Link from "next/link";
import { formatTime } from "@/lib/format";
import { Avatar } from "@/ui/avatar";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { UNIT_STYLE } from "@/ui/units";

type Row = { id: string; name: string; unit: string | null; jobTitle: string | null; state: string; firstInAt: string | null; minutesLate: number; flagged: boolean };

const GROUPS: { key: string; label: string; dot: string }[] = [
  { key: "LATE", label: "Late", dot: "bg-warning" },
  { key: "NOT_IN", label: "Not in yet", dot: "bg-danger" },
  { key: "IN", label: "Clocked in", dot: "bg-success" },
  { key: "OUT", label: "Clocked out", dot: "bg-ink-3" },
  { key: "LEAVE", label: "On leave", dot: "bg-accent" },
  { key: "OFF", label: "Off today", dot: "bg-surface-3" },
];

export function TeamToday({ rows }: { rows: Row[] }) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {GROUPS.map((g) => (
          <div key={g.key} className="rounded-xl border border-line bg-surface px-3 py-2.5 shadow-card">
            <p className="flex items-center gap-1.5 text-2xs text-ink-3">
              <span className={cn("size-1.5 rounded-full", g.dot)} />
              {g.label}
            </p>
            <p className="text-[20px] font-semibold tabular">{rows.filter((r) => r.state === g.key).length}</p>
          </div>
        ))}
      </div>
      <Card padded={false}>
        <ul className="divide-y divide-line">
          {GROUPS.flatMap((g) =>
            rows
              .filter((r) => r.state === g.key)
              .map((r) => (
                <li key={r.id}>
                  <Link href={`/work/attendance?tab=month&user=${r.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2/60">
                    <Avatar id={r.id} name={r.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{r.name}</p>
                      <p className="truncate text-2xs text-ink-3">
                        {r.jobTitle ?? "—"}
                        {r.unit && ` · ${UNIT_STYLE[r.unit]?.label}`}
                      </p>
                    </div>
                    {r.flagged && <Flag className="size-3.5 text-warning" aria-label="Flagged" />}
                    <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
                      <span className={cn("size-1.5 rounded-full", g.dot)} />
                      {g.label}
                      {r.firstInAt && <span className="tabular text-ink-3">· {formatTime(new Date(r.firstInAt))}</span>}
                      {r.minutesLate > 0 && <span className="tabular text-warning">· {r.minutesLate}m</span>}
                    </span>
                  </Link>
                </li>
              )),
          )}
          {rows.length === 0 && <li className="px-4 py-10 text-center text-[13px] text-ink-3">No one in your scope.</li>}
        </ul>
      </Card>
    </div>
  );
}
