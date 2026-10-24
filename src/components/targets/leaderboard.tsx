import { Trophy } from "lucide-react";
import { Avatar } from "@/ui/avatar";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { UNIT_STYLE } from "@/ui/units";
import { Progress } from "./progress";

type Row = { user: { id: string; name: string; unit: string | null }; targetPct: number | null; onTimeRate: number | null };

export function Leaderboard({ rows }: { rows: Row[] }) {
  const ranked = rows
    .filter((r) => r.targetPct !== null)
    .sort((a, b) => (b.targetPct ?? 0) - (a.targetPct ?? 0) || (b.onTimeRate ?? 0) - (a.onTimeRate ?? 0));
  const units = [...new Set(ranked.map((r) => r.user.unit ?? "—"))];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {units.map((u) => (
        <Card key={u}>
          <p className="mb-3 flex items-center gap-2 text-[14px] font-semibold">
            {u !== "—" && <span className={cn("size-2 rounded-full", UNIT_STYLE[u]?.dot)} />}
            {UNIT_STYLE[u]?.label ?? "Other"}
          </p>
          <ol className="grid gap-3">
            {ranked
              .filter((r) => (r.user.unit ?? "—") === u)
              .map((r, i) => (
                <li key={r.user.id} className="grid grid-cols-[24px_28px_1fr_48px] items-center gap-2.5">
                  <span className={cn("text-center text-[13px] font-semibold tabular", i === 0 ? "text-warning" : "text-ink-3")}>{i === 0 ? <Trophy className="mx-auto size-4" /> : i + 1}</span>
                  <Avatar id={r.user.id} name={r.user.name} size={26} />
                  <div>
                    <p className="text-[13px] font-medium">{r.user.name}</p>
                    <Progress pct={r.targetPct ?? 0} className="mt-1" />
                  </div>
                  <span className="text-right text-[13px] font-semibold tabular">{r.targetPct}%</span>
                </li>
              ))}
          </ol>
        </Card>
      ))}
      {ranked.length === 0 && <p className="text-[13px] text-ink-3">No targets set this week yet.</p>}
    </div>
  );
}
