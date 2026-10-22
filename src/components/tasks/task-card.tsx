"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, ListChecks, SignalHigh, TriangleAlert } from "lucide-react";
import type { BoardTask } from "@/server/modules/tasks/service";
import { describeDue } from "@/lib/format";
import { Avatar } from "@/ui/avatar";
import { cn } from "@/ui/cn";
import { UNIT_STYLE } from "@/ui/units";
import { OriginBadge } from "./origin-badge";

const DUE_TONE = {
  overdue: "text-danger",
  today: "text-warning",
  soon: "text-ink-2",
  later: "text-ink-3",
} as const;

export function TaskCardBody({ task, lifted }: { task: BoardTask; lifted?: boolean }) {
  const due = task.dueAt && task.status !== "DONE" ? describeDue(task.dueAt) : null;
  const unit = UNIT_STYLE[task.unit.code];
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-line bg-surface p-3 pl-3.5 text-left shadow-card transition-[box-shadow,border-color] duration-150",
        "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        unit?.rail,
        lifted ? "rotate-[1.5deg] border-line-strong shadow-lift" : "group-hover:border-line-strong",
        task.status === "DONE" && "opacity-70",
      )}
    >
      <div className="flex items-center gap-1.5">
        <OriginBadge origin={task.origin} />
        <span className="truncate text-2xs text-ink-3">{unit?.label ?? task.unit.name}</span>
        <span className="ml-auto">
          {task.priority === "URGENT" ? (
            <TriangleAlert className="size-3.5 text-danger" aria-label="Urgent" />
          ) : task.priority === "HIGH" ? (
            <SignalHigh className="size-3.5 text-warning" aria-label="High priority" />
          ) : null}
        </span>
      </div>
      <p className={cn("mt-2 line-clamp-2 text-[13px] font-medium leading-[18px]", task.status === "DONE" && "text-ink-2 line-through decoration-ink-3/50")}>
        {task.title}
      </p>
      <div className="mt-2.5 flex items-center gap-3 text-2xs">
        {due && (
          <span className={cn("inline-flex items-center gap-1 font-medium tabular", DUE_TONE[due.tone])}>
            <CalendarClock className="size-3" />
            {due.label}
          </span>
        )}
        {task.checklist.total > 0 && (
          <span className={cn("inline-flex items-center gap-1 tabular", task.checklist.done === task.checklist.total ? "text-success" : "text-ink-3")}>
            <ListChecks className="size-3" />
            {task.checklist.done}/{task.checklist.total}
          </span>
        )}
        <span className="ml-auto">{task.assignee && <Avatar id={task.assignee.id} name={task.assignee.name} size={20} />}</span>
      </div>
    </div>
  );
}

export function SortableTaskCard({ task, onOpen, disabled }: { task: BoardTask; onOpen: (id: string) => void; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { status: task.status },
    disabled,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("group list-none outline-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      aria-roledescription="Draggable task"
      aria-label={`${task.title}. Press space to pick up, arrows to move, space to drop. Enter to open.`}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(task.id);
        listeners?.onKeyDown?.(e);
      }}
    >
      <TaskCardBody task={task} />
    </li>
  );
}
