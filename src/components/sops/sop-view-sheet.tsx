"use client";

import { Pencil, Repeat2 } from "lucide-react";
import type { SopCard } from "@/server/modules/sops/service";
import { formatDay } from "@/lib/format";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { Dialog, SheetContent } from "@/ui/dialog";

export function SopViewSheet({ sop, onClose, onEdit }: { sop: SopCard | null; onClose: () => void; onEdit: (s: SopCard) => void }) {
  return (
    <Dialog open={!!sop} onOpenChange={(o) => !o && onClose()}>
      {sop && (
        <SheetContent
          title={sop.title}
          header={
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-2xs text-ink-3">
                <Repeat2 className="size-3" /> {sop.schedule} · {sop.unit.name} · v{sop.version}
              </span>
              {sop.canEdit && (
                <Button size="sm" variant="secondary" onClick={() => onEdit(sop)}>
                  <Pencil className="size-3" /> Edit
                </Button>
              )}
            </div>
          }
        >
          {sop.summary && <p className="mb-5 whitespace-pre-wrap text-[13px] leading-5 text-ink-2">{sop.summary}</p>}
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">Steps</h3>
          <ol className="grid gap-2">
            {sop.steps.map((st, i) => (
              <li key={i} className="flex gap-3 rounded-lg border border-line bg-surface-2/40 p-3">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-surface text-2xs font-semibold text-ink-2 ring-1 ring-line tabular">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{st.title}</p>
                  {st.detail && <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-ink-3">{st.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
          <h3 className="mb-2 mt-6 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">Assigned to</h3>
          {sop.assignees.length ? (
            <ul className="grid gap-2">
              {sop.assignees.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-[13px]">
                  <Avatar id={a.id} name={a.name} size={22} /> {a.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3">No one yet.</p>
          )}
          <p className="mt-6 text-2xs text-ink-3">
            {sop.lastGeneratedOn ? `Tasks last generated ${formatDay(sop.lastGeneratedOn, { weekday: true })}.` : "Tasks not generated yet."}
            {sop.nextOn && ` Next due ${formatDay(sop.nextOn, { weekday: true })} at ${sop.dueTime}.`}
          </p>
        </SheetContent>
      )}
    </Dialog>
  );
}
