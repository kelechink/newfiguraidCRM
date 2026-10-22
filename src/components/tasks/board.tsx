"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Crown, KanbanSquare, Plus, Repeat2, UsersRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import type { TaskOrigin } from "@/domain/tasks/origin";
import type { AssignableUser } from "@/server/modules/users/service";
import { moveTaskAction } from "@/server/modules/tasks/actions";
import { BOARD_STATUSES, type BoardStatus } from "@/server/modules/tasks/schemas";
import type { BoardTask } from "@/server/modules/tasks/service";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { EmptyState } from "@/ui/empty-state";
import { PageHeader } from "@/ui/page-header";
import { useToast } from "@/ui/toast";
import { NewTaskDialog } from "./new-task-dialog";
import { SortableTaskCard, TaskCardBody } from "./task-card";
import { TaskDrawer } from "./task-drawer";

const COLUMNS: Record<BoardStatus, { label: string; dot: string; empty: string }> = {
  TODO: { label: "To do", dot: "bg-ink-3", empty: "Nothing waiting" },
  IN_PROGRESS: { label: "In progress", dot: "bg-accent", empty: "Drag a task here when you start it" },
  BLOCKED: { label: "Blocked", dot: "bg-danger", empty: "Nothing blocked" },
  DONE: { label: "Done", dot: "bg-success", empty: "Finished work shows here for 14 days" },
};

type OriginFilter = TaskOrigin | "ALL";
type Columns = Record<BoardStatus, string[]>;

const ORIGIN_TABS: { key: OriginFilter; label: string; icon?: typeof Crown }[] = [
  { key: "ALL", label: "All" },
  { key: "FOUNDER", label: "Founder", icon: Crown },
  { key: "TEAM_LEAD", label: "Team lead", icon: UsersRound },
  { key: "SOP", label: "SOP", icon: Repeat2 },
];

// Left/right jumps to the neighbouring column; up/down reorders within one.
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  if (event.code !== "ArrowLeft" && event.code !== "ArrowRight") return sortableKeyboardCoordinates(event, args);
  event.preventDefault();
  const { droppableRects, droppableContainers, collisionRect } = args.context;
  if (!collisionRect) return undefined;
  const columns = droppableContainers
    .getEnabled()
    .filter((c) => String(c.id).startsWith("col:"))
    .map((c) => droppableRects.get(c.id))
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => a.left - b.left);
  const centre = collisionRect.left + collisionRect.width / 2;
  const here = columns.findIndex((r) => centre >= r.left && centre <= r.left + r.width);
  const next = columns[here + (event.code === "ArrowRight" ? 1 : -1)];
  return next ? { x: next.left + 6, y: next.top + 6 } : undefined;
};

function toColumns(tasks: BoardTask[]): Columns {
  const cols: Columns = { TODO: [], IN_PROGRESS: [], BLOCKED: [], DONE: [] };
  for (const t of tasks) cols[t.status].push(t.id); // tasks arrive in rank order
  return cols;
}

function Column({ status, children, count }: { status: BoardStatus; children: React.ReactNode; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}`, data: { status } });
  const col = COLUMNS[status];
  return (
    <section aria-label={col.label} className="flex w-[300px] shrink-0 snap-start flex-col sm:w-[292px] xl:w-auto xl:min-w-0 xl:flex-1">
      <header className="flex h-8 items-center gap-2 px-1">
        <span className={cn("size-2 rounded-full", col.dot)} />
        <h2 className="text-[13px] font-semibold">{col.label}</h2>
        <span className="text-[12px] font-medium text-ink-3 tabular">{count}</span>
      </header>
      <div
        ref={setNodeRef}
        className={cn(
          "mt-1.5 flex min-h-[160px] flex-1 flex-col rounded-xl border border-transparent bg-surface-2/70 p-1.5 transition-colors",
          isOver && "border-accent/30 bg-accent-soft/40",
        )}
      >
        {children}
        {count === 0 && <p className="m-auto px-4 py-6 text-center text-[12px] text-ink-3">{col.empty}</p>}
      </div>
    </section>
  );
}

export function TaskBoard({
  initialTasks,
  me,
  canCreate,
  createOrigin,
  assignable,
  units,
  initialOrigin,
  showMineToggle,
}: {
  initialTasks: BoardTask[];
  me: string;
  canCreate: boolean;
  createOrigin: "FOUNDER" | "TEAM_LEAD";
  assignable: AssignableUser[];
  units: { id: string; code: string; name: string }[];
  initialOrigin: OriginFilter;
  showMineToggle: boolean;
}) {
  const toast = useToast();
  const [tasks, setTasks] = useState(() => new Map(initialTasks.map((t) => [t.id, t])));
  const [columns, setColumns] = useState<Columns>(() => toColumns(initialTasks));
  const [origin, setOrigin] = useState<OriginFilter>(initialOrigin);
  const [mineOnly, setMineOnly] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const dragStart = useRef<{ columns: Columns; status: BoardStatus } | null>(null);
  const lastDrop = useRef(0);
  // A drop ends with a click on the card underneath; don't treat that as "open".
  const openTask = useCallback((id: string) => {
    if (Date.now() - lastDrop.current > 250) setOpenId(id);
  }, []);

  // Server re-render (after create / generate) replaces local state.
  const [seen, setSeen] = useState(initialTasks);
  if (seen !== initialTasks) {
    setSeen(initialTasks);
    setTasks(new Map(initialTasks.map((t) => [t.id, t])));
    setColumns(toColumns(initialTasks));
  }

  const visible = useCallback(
    (id: string) => {
      const t = tasks.get(id);
      return !!t && (origin === "ALL" || t.origin === origin) && (!mineOnly || t.assignee?.id === me);
    },
    [tasks, origin, mineOnly, me],
  );
  const shown = useMemo(
    () => Object.fromEntries(BOARD_STATUSES.map((s) => [s, columns[s].filter(visible)])) as Columns,
    [columns, visible],
  );
  const counts = useMemo(() => {
    const c: Record<OriginFilter, number> = { ALL: 0, FOUNDER: 0, TEAM_LEAD: 0, SOP: 0 };
    for (const t of tasks.values()) {
      if (mineOnly && t.assignee?.id !== me) continue;
      c.ALL++;
      c[t.origin]++;
    }
    return c;
  }, [tasks, mineOnly, me]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), // lets phones scroll the board
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  const statusOf = (id: string): BoardStatus | null => {
    if (id.startsWith("col:")) return id.slice(4) as BoardStatus;
    return BOARD_STATUSES.find((s) => columns[s].includes(id)) ?? null;
  };

  const onDragStart = ({ active }: DragStartEvent) => {
    const status = statusOf(String(active.id));
    if (!status) return;
    dragStart.current = { columns, status };
    setActiveId(String(active.id));
  };

  // Moving across columns while hovering, so the card visibly lands where it will drop.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = statusOf(String(active.id));
    const to = statusOf(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((cols) => {
      const target = cols[to].filter(visible);
      const overIndex = String(over.id).startsWith("col:") ? target.length : target.indexOf(String(over.id));
      const anchor = target[overIndex];
      const without = cols[to].filter((x) => x !== active.id);
      const at = anchor ? without.indexOf(anchor) : without.length;
      return { ...cols, [from]: cols[from].filter((x) => x !== active.id), [to]: [...without.slice(0, at), String(active.id), ...without.slice(at)] };
    });
  };

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    lastDrop.current = Date.now();
    const start = dragStart.current;
    dragStart.current = null;
    const id = String(active.id);
    if (!over || !start) {
      if (start) setColumns(start.columns);
      return;
    }
    const status = statusOf(id)!;
    let next = columns;
    const overId = String(over.id);
    if (!overId.startsWith("col:") && overId !== id && statusOf(overId) === status) {
      const list = columns[status];
      next = { ...columns, [status]: arrayMove(list, list.indexOf(id), list.indexOf(overId)) };
      setColumns(next);
    }
    // Neighbours as the user sees them (filtered view); the server fills any gaps.
    const view = next[status].filter(visible);
    const i = view.indexOf(id);
    const beforeId = view[i - 1] ?? null;
    const afterId = view[i + 1] ?? null;
    if (status === start.status && JSON.stringify(start.columns[status]) === JSON.stringify(next[status])) return;

    const prevTask = tasks.get(id)!;
    setTasks((m) => new Map(m).set(id, { ...prevTask, status, completedAt: status === "DONE" ? new Date().toISOString() : null }));
    const res = await moveTaskAction({ taskId: id, status, beforeId, afterId });
    if (res.ok) {
      setTasks((m) => new Map(m).set(id, { ...m.get(id)!, rank: res.data.rank }));
    } else {
      setColumns(start.columns);
      setTasks((m) => new Map(m).set(id, prevTask));
      toast({ tone: "error", title: "Couldn't move the task", body: res.error });
    }
  };

  const setOriginAndUrl = (o: OriginFilter) => {
    setOrigin(o);
    const url = new URL(window.location.href);
    if (o === "ALL") url.searchParams.delete("origin");
    else url.searchParams.set("origin", o);
    window.history.replaceState(null, "", url);
  };

  const active = activeId ? tasks.get(activeId) : null;
  const total = tasks.size;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Tasks"
        description="Everything on the team's plate — from the founder, team leads and SOP schedules."
        actions={
          <>
            <Link href="/work/sops">
              <Button variant="secondary">
                <Repeat2 className="size-3.5" /> SOP templates
              </Button>
            </Link>
            {canCreate && (
              <NewTaskDialog origin={createOrigin} assignable={assignable} units={units}>
                <Button variant="primary">
                  <Plus className="size-3.5" /> New task
                </Button>
              </NewTaskDialog>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Filter by origin" className="flex gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5">
          {ORIGIN_TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={origin === t.key}
              onClick={() => setOriginAndUrl(t.key)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium transition-all",
                origin === t.key ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink-2",
              )}
            >
              {t.icon && <t.icon className="size-3.5" />}
              {t.label}
              <span className={cn("tabular text-2xs", origin === t.key ? "text-ink-3" : "text-ink-3/70")}>{counts[t.key]}</span>
            </button>
          ))}
        </div>
        {showMineToggle && (
          <label className="flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[12.5px] font-medium text-ink-2 hover:bg-surface-2">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="size-3.5 accent-[hsl(var(--accent))]" />
            Only my tasks
          </label>
        )}
      </div>

      {total === 0 ? (
        <EmptyState
          icon={<KanbanSquare className="size-5" />}
          title={canCreate ? "No tasks yet" : "You're all clear"}
          body={
            canCreate
              ? "Assign a task to someone, or set up an SOP template and generate its due tasks."
              : "When the founder, your team lead or an SOP schedule gives you work, it lands here."
          }
          action={
            canCreate ? (
              <NewTaskDialog origin={createOrigin} assignable={assignable} units={units}>
                <Button variant="primary">
                  <Plus className="size-3.5" /> New task
                </Button>
              </NewTaskDialog>
            ) : undefined
          }
        />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { if (dragStart.current) setColumns(dragStart.current.columns); dragStart.current = null; setActiveId(null); }}>
          <div className="scrollbar-thin -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:snap-none">
            {BOARD_STATUSES.map((status) => (
              <Column key={status} status={status} count={shown[status].length}>
                <SortableContext items={shown[status]} strategy={verticalListSortingStrategy}>
                  <ul className="flex flex-col gap-1.5">
                    {shown[status].map((id) => (
                      <SortableTaskCard key={id} task={tasks.get(id)!} onOpen={openTask} />
                    ))}
                  </ul>
                </SortableContext>
              </Column>
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}>
            {active ? <TaskCardBody task={active} lifted /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <TaskDrawer
        task={openId ? (tasks.get(openId) ?? null) : null}
        onClose={() => setOpenId(null)}
        onChecklistChange={(id, done, total) => setTasks((m) => new Map(m).set(id, { ...m.get(id)!, checklist: { done, total } }))}
      />
    </div>
  );
}
