"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { createTaskAction } from "@/server/modules/tasks/actions";
import type { AssignableUser } from "@/server/modules/users/service";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { OriginBadge } from "./origin-badge";

export function NewTaskDialog({
  children,
  origin,
  assignable,
  units,
}: {
  children: ReactNode;
  origin: "FOUNDER" | "TEAM_LEAD";
  assignable: AssignableUser[];
  units: { id: string; code: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [unitId, setUnitId] = useState(units[0]?.id ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const people = useMemo(() => assignable.filter((u) => u.unitIds.includes(unitId)), [assignable, unitId]);

  const submit = (form: FormData) => {
    const dueDate = String(form.get("dueDate") || "");
    const dueTime = String(form.get("dueTime") || "17:00");
    start(async () => {
      const res = await createTaskAction({
        title: form.get("title"),
        description: form.get("description") || undefined,
        unitId,
        assigneeId: form.get("assigneeId"),
        priority: form.get("priority"),
        // entered in Lagos time (UTC+1)
        dueAt: dueDate ? `${dueDate}T${dueTime}:00+01:00` : undefined,
      });
      if (res.ok) {
        setOpen(false);
        setErrors({});
        toast({ tone: "success", title: "Task assigned" });
        router.refresh();
      } else {
        setErrors(res.fields ?? {});
        toast({ tone: "error", title: "Couldn't create the task", body: res.error });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        title="New task"
        description="It lands at the top of the assignee's To do column and they're notified."
        footer={
          <>
            <span className="mr-auto flex items-center gap-1.5 text-2xs text-ink-3">
              Shows as <OriginBadge origin={origin} />
            </span>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="new-task" variant="primary" loading={pending}>
              Assign task
            </Button>
          </>
        }
      >
        <form id="new-task" action={submit} className="grid gap-4">
          <Field label="Title" htmlFor="t-title" error={errors.title}>
            <Input id="t-title" name="title" required autoFocus placeholder="e.g. Call back the Uyo school about the AI cohort" maxLength={200} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Unit" htmlFor="t-unit">
              <Select id="t-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Assignee" htmlFor="t-assignee" error={errors.assigneeId}>
              <Select id="t-assignee" name="assigneeId" required key={unitId} defaultValue="">
                <option value="" disabled>
                  {people.length ? "Choose a person" : "No one in this unit"}
                </option>
                {people.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.roleName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Due date" htmlFor="t-due">
              <Input id="t-due" name="dueDate" type="date" />
            </Field>
            <Field label="Time" htmlFor="t-time">
              <Input id="t-time" name="dueTime" type="time" defaultValue="17:00" />
            </Field>
            <Field label="Priority" htmlFor="t-priority">
              <Select id="t-priority" name="priority" defaultValue="MEDIUM">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </Field>
          </div>
          <Field label="Notes" htmlFor="t-notes" hint="Optional. Context, links, what done looks like.">
            <Textarea id="t-notes" name="description" maxLength={5000} />
          </Field>
        </form>
      </DialogContent>
    </Dialog>
  );
}
