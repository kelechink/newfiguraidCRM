"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { saveSopAction } from "@/server/modules/sops/actions";
import type { SopCard } from "@/server/modules/sops/service";
import type { AssignableUser } from "@/server/modules/users/service";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { useToast } from "@/ui/toast";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
type Frequency = SopCard["frequency"];

interface Step {
  key: number;
  title: string;
  detail: string;
}

let stepKey = 0;

export function SopEditorDialog({
  sop,
  assignable,
  units,
  onClose,
}: {
  sop: SopCard | null;
  assignable: AssignableUser[];
  units: { id: string; code: string; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [title, setTitle] = useState(sop?.title ?? "");
  const [summary, setSummary] = useState(sop?.summary ?? "");
  const [unitId, setUnitId] = useState(sop?.unit.id ?? units[0]?.id ?? "");
  const [frequency, setFrequency] = useState<Frequency>(sop?.frequency ?? "WEEKLY");
  const [weekdays, setWeekdays] = useState<number[]>(sop?.weekdays.length ? sop.weekdays : [1]);
  const [dayOfMonth, setDayOfMonth] = useState<number>(sop?.dayOfMonth ?? 1);
  const [dueTime, setDueTime] = useState(sop?.dueTime ?? "17:00");
  const [priority, setPriority] = useState(sop?.defaultPriority ?? "MEDIUM");
  const [isActive, setIsActive] = useState(sop?.isActive ?? true);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(sop?.assignees.map((a) => a.id) ?? []);
  const [steps, setSteps] = useState<Step[]>(
    sop?.steps.length ? sop.steps.map((s) => ({ key: stepKey++, title: s.title, detail: s.detail ?? "" })) : [{ key: stepKey++, title: "", detail: "" }],
  );

  const people = useMemo(() => assignable.filter((u) => u.unitIds.includes(unitId)), [assignable, unitId]);

  const moveStep = (i: number, by: -1 | 1) =>
    setSteps((s) => {
      const next = [...s];
      const [item] = next.splice(i, 1);
      next.splice(i + by, 0, item!);
      return next;
    });

  const save = () =>
    start(async () => {
      const res = await saveSopAction({
        id: sop?.id,
        title,
        summary: summary || undefined,
        unitId,
        frequency,
        weekdays: frequency === "WEEKLY" ? weekdays : [],
        dayOfMonth: frequency === "MONTHLY" ? dayOfMonth : null,
        dueTime,
        defaultPriority: priority,
        assigneeIds: assigneeIds.filter((id) => people.some((p) => p.id === id)),
        steps: steps.filter((s) => s.title.trim()).map((s) => ({ title: s.title, detail: s.detail || undefined })),
        isActive,
      });
      if (res.ok) {
        toast({ tone: "success", title: sop ? "SOP updated" : "SOP created" });
        onClose();
        router.refresh();
      } else {
        setErrors(res.fields ?? {});
        toast({ tone: "error", title: "Couldn't save the SOP", body: res.error });
      }
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={sop ? "Edit SOP" : "New SOP"}
        description={sop ? "Editing steps bumps the version. Tasks already generated keep their checklist." : "Write the procedure once; generate tasks on its schedule."}
        className="max-w-[640px]"
        footer={
          <>
            {sop && (
              <label className="mr-auto flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-3.5 accent-[hsl(var(--accent))]" />
                Active
              </label>
            )}
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={pending}>
              {sop ? "Save changes" : "Create SOP"}
            </Button>
          </>
        }
      >
        <div className="grid gap-5">
          <Field label="Title" htmlFor="s-title" error={errors.title}>
            <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekly telecom margin review" autoFocus maxLength={200} />
          </Field>
          <Field label="Purpose" htmlFor="s-summary" hint="One or two lines on why this matters. Shown on every generated task.">
            <Textarea id="s-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} className="min-h-[56px]" />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
            <Field label="Unit" htmlFor="s-unit">
              <Select id="s-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Repeats" htmlFor="s-freq">
              <Select id="s-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                <option value="DAILY">Every working day</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="ON_DEMAND">On demand only</option>
              </Select>
            </Field>
            <Field label="Due by" htmlFor="s-time" error={errors.dueTime}>
              <Input id="s-time" type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
            </Field>
          </div>

          {frequency === "WEEKLY" && (
            <Field label="On" error={errors.weekdays}>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Weekdays">
                {WEEKDAYS.map((d, i) => {
                  const on = weekdays.includes(i + 1);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== i + 1) : [...w, i + 1]))}
                      className={cn(
                        "h-8 w-11 rounded-md border text-[12.5px] font-medium transition-colors",
                        on ? "border-accent/40 bg-accent-soft text-accent-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}
          {frequency === "MONTHLY" && (
            <Field label="Day of month" htmlFor="s-dom" hint="29–31 run on the last day of shorter months." error={errors.dayOfMonth}>
              <Input id="s-dom" type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} className="w-24" />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <Field label="Assignees" hint="Each person gets their own task every time it's due." error={errors.assigneeIds}>
              <div className="scrollbar-thin max-h-40 overflow-y-auto rounded-[7px] border border-line">
                {people.length === 0 ? (
                  <p className="p-3 text-[12.5px] text-ink-3">No active staff in this unit.</p>
                ) : (
                  people.map((p) => {
                    const on = assigneeIds.includes(p.id);
                    return (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-2 text-[13px] last:border-0 hover:bg-surface-2">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setAssigneeIds((a) => (on ? a.filter((x) => x !== p.id) : [...a, p.id]))}
                          className="size-3.5 accent-[hsl(var(--accent))]"
                        />
                        <Avatar id={p.id} name={p.name} size={20} />
                        <span className="flex-1">{p.name}</span>
                        <span className="text-2xs text-ink-3">{p.roleName}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </Field>
            <Field label="Priority" htmlFor="s-priority">
              <Select id="s-priority" value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </Field>
          </div>

          <Field label="Steps" error={errors.steps}>
            <ol className="grid gap-2">
              {steps.map((s, i) => (
                <li key={s.key} className="flex gap-2 rounded-lg border border-line bg-surface-2/40 p-2">
                  <span className="mt-1.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface text-2xs font-semibold text-ink-2 ring-1 ring-line tabular">{i + 1}</span>
                  <div className="grid flex-1 gap-1.5">
                    <Input
                      aria-label={`Step ${i + 1}`}
                      value={s.title}
                      placeholder="What to do"
                      maxLength={300}
                      onChange={(e) => setSteps((all) => all.map((x) => (x.key === s.key ? { ...x, title: e.target.value } : x)))}
                    />
                    <Input
                      aria-label={`Step ${i + 1} detail`}
                      value={s.detail}
                      placeholder="Detail or link (optional)"
                      maxLength={2000}
                      className="h-7 text-[12.5px]"
                      onChange={(e) => setSteps((all) => all.map((x) => (x.key === s.key ? { ...x, detail: e.target.value } : x)))}
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => moveStep(i, -1)} className="rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-30">
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button type="button" aria-label="Move down" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)} className="rounded p-1 text-ink-3 hover:bg-surface-3 hover:text-ink disabled:opacity-30">
                      <ArrowDown className="size-3.5" />
                    </button>
                    <button type="button" aria-label="Remove step" disabled={steps.length === 1} onClick={() => setSteps((all) => all.filter((x) => x.key !== s.key))} className="rounded p-1 text-ink-3 hover:bg-danger/10 hover:text-danger disabled:opacity-30">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            <Button type="button" size="sm" variant="ghost" className="justify-self-start" onClick={() => setSteps((s) => [...s, { key: stepKey++, title: "", detail: "" }])}>
              <Plus className="size-3.5" /> Add step
            </Button>
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
