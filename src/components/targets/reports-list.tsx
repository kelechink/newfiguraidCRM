"use client";

import { useRouter } from "next/navigation";
import { formatTime } from "@/lib/format";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { Input } from "@/ui/field";

type Row = { user: { id: string; name: string }; report: { accomplished: string; blockers: string | null; tomorrow: string | null; submittedAt: string } | null };

export function ReportsList({ date, rows }: { date: string; rows: Row[] }) {
  const router = useRouter();
  const filed = rows.filter((r) => r.report);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input type="date" defaultValue={date} onChange={(e) => router.push(`/work/targets?tab=reports&date=${e.target.value}`)} className="w-44" aria-label="Report date" />
        <span className="text-[12.5px] text-ink-3">{filed.length} of {rows.length} filed</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <Card key={r.user.id} className={r.report ? undefined : "opacity-60"}>
            <div className="mb-2 flex items-center gap-2.5">
              <Avatar id={r.user.id} name={r.user.name} size={26} />
              <p className="flex-1 text-[13px] font-semibold">{r.user.name}</p>
              {r.report ? <span className="text-2xs text-ink-3 tabular">{formatTime(new Date(r.report.submittedAt))}</span> : <Badge tone="warning">Not filed</Badge>}
            </div>
            {r.report && (
              <div className="grid gap-2 text-[12.5px] leading-5">
                <p className="whitespace-pre-wrap text-ink-2">{r.report.accomplished}</p>
                {r.report.blockers && <p className="whitespace-pre-wrap rounded-md bg-danger/5 px-2 py-1.5 text-danger"><b className="font-semibold">Blocker:</b> {r.report.blockers}</p>}
                {r.report.tomorrow && <p className="whitespace-pre-wrap text-ink-3"><b className="font-semibold">Tomorrow:</b> {r.report.tomorrow}</p>}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
