"use client";

import { Check, Repeat2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getTaskDetailAction, toggleChecklistAction } from "@/server/modules/tasks/actions";
import type { BoardTask, TaskDetail } from "@/server/modules/tasks/service";
import { describeDue, formatDay } from "@/lib/format";
import { Avatar } from "@/ui/avatar";
import { cn } from "@/ui/cn";
import { Dialog, SheetContent } from "@/ui/dialog";
import { useToast } from "@/ui/toast";
import { UNIT_STYLE } from "@/ui/units";
import { OriginBadge } from "./origin-badge";

const STATUS_LABEL = { TODO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", DONE: "Done" } as const;
const PRIORITY_LABEL = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3 py-1.5 text-[13px]">
      <span className="text-ink-3">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function TaskDrawer({
  task,
  onClose,
  onChecklistChange,
}: {
  task: BoardTask | null;
  onClose: () => void;
  onChecklistChange: (taskId: string, done: number, total: number) => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<TaskDetail | null>(null);

  useEffect(() => {
    setDetail(null);
    if (!task) return;
    let live = true;
    getTaskDetailAction(task.id).then((res) => {
      if (!live) return;
      if (res.ok) setDetail(res.data);
      else toast({ tone: "error", title: "Couldn't open the task", body: res.error });
    });
    return () => {
      live = false;
    };
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (itemId: string, done: boolean) => {
    if (!detail || !task) return;
    const before = detail;
    const checklist = detail.checklist.map((c) => (c.id === itemId ? { ...c, done } : c));
    setDetail({ ...detail, checklist });
    onChecklistChange(task.id, checklist.filter((c) => c.done).length, checklist.length);
    const res = await toggleChecklistAction({ itemId, done });
    if (!res.ok) {
      setDetail(before);
      onChecklistChange(task.id, before.checklist.filter((c) => c.done).length, before.checklist.length);
      toast({ tone: "error", title: "Couldn't update the checklist", body: res.error });
    }
  };

  const fromLine =
    task?.origin === "SOP"
      ? `Generated from the “${task.sop?.title ?? "SOP"}” schedule`
      : task
        ? `Assigned by ${task.createdBy.name}`
        : "";
  const due = task?.dueAt ? describeDue(task.dueAt) : null;

  return (
    <Dialog open={!!task} onOpenChange={(o) => !o && onClose()}>
      {task && (
        <SheetContent
          title={task.title}
          header={
            <div className="flex items-center gap-2">
              <OriginBadge origin={task.origin} />
              <span className="text-2xs text-ink-3">{fromLine}</span>
            </div>
          }
        >
          <div className="divide-y divide-line">
            <div className="pb-3">
              <Row label="Status">{STATUS_LABEL[task.status]}</Row>
              <Row label="Assignee">
                {task.assignee ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar id={task.assignee.id} name={task.assignee.name} size={20} />
                    {task.assignee.name}
                  </span>
                ) : (
                  <span className="text-ink-3">Unassigned</span>
                )}
              </Row>
              <Row label="Due">
                {due ? (
                  <span className={cn(due.tone === "overdue" && "font-medium text-danger", due.tone === "today" && "font-medium text-warning")}>
                    {task.status === "DONE" ? formatDay(task.dueAt!, { weekday: true }) : due.label}
                  </span>
                ) : (
                  <span className="text-ink-3">No due date</span>
                )}
              </Row>
              <Row label="Priority">{PRIORITY_LABEL[task.priority]}</Row>
              <Row label="Unit">
                <span className="inline-flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", UNIT_STYLE[task.unit.code]?.dot)} />
                  {task.unit.name}
                </span>
              </Row>
            </div>

            {(detail?.description ?? task.description) && (
              <div className="py-4">
                <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">Notes</h3>
                {/* plain text, rendered escaped — never as HTML */}
                <p className="whitespace-pre-wrap text-[13px] leading-5 text-ink-2">{detail?.description ?? task.description}</p>
              </div>
            )}

            {task.checklist.total > 0 && (
              <div className="py-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-ink-3">SOP steps</h3>
                  <span className="text-2xs text-ink-3 tabular">
                    {task.checklist.done} of {task.checklist.total}
                  </span>
                </div>
                <div className="mb-3 h-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${(task.checklist.done / task.checklist.total) * 100}%` }} />
                </div>
                {!detail ? (
                  <div className="grid gap-2">
                    {Array.from({ length: Math.min(task.checklist.total, 4) }, (_, i) => (
                      <div key={i} className="h-8 animate-pulse rounded-md bg-surface-2" />
                    ))}
                  </div>
                ) : (
                  <ol className="grid gap-1">
                    {detail.checklist.map((c, i) => (
                      <li key={c.id}>
                        <button
                          disabled={!detail.canEdit}
                          onClick={() => toggle(c.id, !c.done)}
                          className="flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
                        >
                          <span
                            className={cn(
                              "mt-px flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                              c.done ? "border-success bg-success text-white" : "border-line-strong bg-surface",
                            )}
                          >
                            {c.done && <Check className="size-3" strokeWidth={3} />}
                          </span>
                          <span className={cn(c.done && "text-ink-3 line-through")}>
                            <span className="mr-1.5 text-ink-3 tabular">{i + 1}.</span>
                            {c.label}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                {task.sop && (
                  <Link href="/work/sops" className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline">
                    <Repeat2 className="size-3.5" /> View the SOP
                  </Link>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      )}
    </Dialog>
  );
}
