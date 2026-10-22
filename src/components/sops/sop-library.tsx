"use client";

import { BookOpenCheck, CalendarClock, ListChecks, Pause, Plus, Repeat2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateDueTasksAction } from "@/server/modules/sops/actions";
import type { SopCard } from "@/server/modules/sops/service";
import type { AssignableUser } from "@/server/modules/users/service";
import { formatDay } from "@/lib/format";
import { AvatarStack } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { EmptyState } from "@/ui/empty-state";
import { PageHeader } from "@/ui/page-header";
import { useToast } from "@/ui/toast";
import { UNIT_STYLE } from "@/ui/units";
import { SopEditorDialog } from "./sop-editor-dialog";
import { SopViewSheet } from "./sop-view-sheet";

function useGenerate() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const run = (sopId?: string) =>
    start(async () => {
      const res = await generateDueTasksAction({ sopId });
      if (!res.ok) return toast({ tone: "error", title: "Couldn't generate tasks", body: res.error });
      const { created, alreadyExisted, sops } = res.data;
      if (created === 0) {
        toast({ tone: "success", title: "All caught up", body: "Every SOP that's due already has its tasks." });
      } else {
        toast({
          tone: "success",
          title: `${created} task${created === 1 ? "" : "s"} created`,
          body: `From ${sops} SOP${sops === 1 ? "" : "s"}, at the top of each assignee's To do column.${alreadyExisted ? ` ${alreadyExisted} already existed.` : ""}`,
        });
      }
      router.refresh();
    });
  return { run, pending };
}

export function SopLibrary({
  sops,
  canManage,
  assignable,
  units,
}: {
  sops: SopCard[];
  canManage: boolean;
  assignable: AssignableUser[];
  units: { id: string; code: string; name: string }[];
}) {
  const { run, pending } = useGenerate();
  const [viewing, setViewing] = useState<SopCard | null>(null);
  const [editing, setEditing] = useState<SopCard | "new" | null>(null);
  const dueTotal = sops.reduce((n, s) => n + (s.canEdit ? s.dueNow : 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="SOP templates"
        description="Step-by-step procedures on a schedule. Generating creates one task per assignee, with the steps as a checklist."
        actions={
          canManage && (
            <>
              <Button variant="secondary" onClick={() => setEditing("new")}>
                <Plus className="size-3.5" /> New SOP
              </Button>
              <Button variant="primary" onClick={() => run()} loading={pending}>
                {!pending && <Sparkles className="size-3.5" />}
                Generate due tasks
                {dueTotal > 0 && <span className="ml-0.5 rounded-[4px] bg-white/20 px-1.5 text-2xs font-semibold tabular">{dueTotal}</span>}
              </Button>
            </>
          )
        }
      />

      {sops.length === 0 ? (
        <EmptyState
          icon={<BookOpenCheck className="size-5" />}
          title={canManage ? "Turn routines into SOPs" : "No SOPs for your unit yet"}
          body={
            canManage
              ? "Write the steps once, choose who does it and how often, then generate the due tasks each day — nothing gets forgotten."
              : "When your team lead publishes procedures, you'll find them here."
          }
          action={
            canManage ? (
              <Button variant="primary" onClick={() => setEditing("new")}>
                <Plus className="size-3.5" /> New SOP
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {sops.map((s) => (
            <li key={s.id}>
              <article
                className={cn(
                  "group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-line bg-surface p-4 pl-[18px] shadow-card transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift",
                  "before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
                  UNIT_STYLE[s.unit.code]?.rail,
                  !s.isActive && "opacity-60",
                )}
                onClick={() => setViewing(s)}
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-2xs text-ink-3">
                      <span>{UNIT_STYLE[s.unit.code]?.label ?? s.unit.name}</span>
                      <span aria-hidden>·</span>
                      <span>v{s.version}</span>
                    </div>
                    <h2 className="mt-1 text-[14px] font-semibold leading-5 tracking-[-0.01em]">{s.title}</h2>
                  </div>
                  {!s.isActive ? (
                    <Badge icon={<Pause className="size-3" />}>Paused</Badge>
                  ) : s.dueNow > 0 ? (
                    <Badge tone="accent">{s.dueNow} due now</Badge>
                  ) : null}
                </div>
                {s.summary && <p className="mt-1.5 line-clamp-2 text-[13px] text-ink-3">{s.summary}</p>}

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Repeat2 className="size-3.5 text-ink-3" />
                    {s.schedule}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ListChecks className="size-3.5 text-ink-3" />
                    {s.steps.length} step{s.steps.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-auto flex items-center gap-3 border-t border-line pt-3 text-2xs text-ink-3 [margin-top:max(auto,16px)]">
                  <AvatarStack people={s.assignees} />
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3" />
                    {s.nextOn ? `Next ${formatDay(s.nextOn, { weekday: true })}` : s.frequency === "ON_DEMAND" ? "On demand" : "Not scheduled"}
                  </span>
                  {s.openTasks > 0 && <span className="tabular">{s.openTasks} open</span>}
                  {s.canEdit && s.dueNow > 0 && s.isActive && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="-my-1 ml-auto text-accent hover:text-accent"
                      onClick={(e) => {
                        e.stopPropagation();
                        run(s.id);
                      }}
                      disabled={pending}
                    >
                      <Sparkles className="size-3" /> Generate
                    </Button>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      <SopViewSheet
        sop={viewing}
        onClose={() => setViewing(null)}
        onEdit={(s) => {
          setViewing(null);
          setEditing(s);
        }}
      />
      {editing && (
        <SopEditorDialog
          sop={editing === "new" ? null : editing}
          assignable={assignable}
          units={units}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
