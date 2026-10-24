"use client";

import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { formatDay } from "@/lib/format";
import { cancelLeaveAction, decideLeaveAction, requestLeaveAction } from "@/server/modules/attendance/actions";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { humanize, StatusBadge } from "@/ui/status";
import { useAction } from "@/ui/use-action";

type Leave = { id: string; type: string; startDate: string; endDate: string; days: number; reason: string | null; status: string; user?: { id: string; name: string } };

const range = (l: Leave) => (l.startDate === l.endDate ? formatDay(l.startDate, { weekday: true }) : `${formatDay(l.startDate)} – ${formatDay(l.endDate)}`);

export function LeavePanel({ mine, toApprove, canApprove }: { mine: Leave[]; toApprove: Leave[]; canApprove: boolean }) {
  const [open, setOpen] = useState(false);
  const request = useAction(requestLeaveAction, { success: (r) => `Requested ${r.days} working day${r.days === 1 ? "" : "s"}`, onSuccess: () => setOpen(false) });
  const decide = useAction(decideLeaveAction, { success: "Saved" });
  const cancel = useAction(cancelLeaveAction, { success: "Request cancelled" });

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card padded={false}>
        <div className="p-4 pb-2">
          <CardHeader
            title="My leave"
            description="Approved leave, sick days and public holidays are never deducted."
            actions={
              <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
                <CalendarPlus className="size-3.5" /> Request leave
              </Button>
            }
          />
        </div>
        <ul className="divide-y divide-line">
          {mine.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-ink-3">No leave requested yet.</li>}
          {mine.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">
                  {humanize(l.type)} leave · {l.days} day{l.days === 1 ? "" : "s"}
                </p>
                <p className="text-2xs text-ink-3">{range(l)}</p>
              </div>
              <StatusBadge status={l.status} />
              {l.status === "PENDING" && (
                <Button size="sm" variant="ghost" onClick={() => cancel.run(l.id)} disabled={cancel.pending}>
                  Cancel
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {canApprove && (
        <Card padded={false}>
          <div className="p-4 pb-2">
            <CardHeader title="Team requests" description="Pending first, then upcoming approved leave." />
          </div>
          <ul className="divide-y divide-line">
            {toApprove.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-ink-3">Nothing waiting.</li>}
            {toApprove.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar id={l.user!.id} name={l.user!.name} size={26} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    {l.user!.name} · {humanize(l.type)} · {l.days}d
                  </p>
                  <p className="text-2xs text-ink-3">
                    {range(l)}
                    {l.reason && ` · ${l.reason}`}
                  </p>
                </div>
                {l.status === "PENDING" ? (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => decide.run({ leaveId: l.id, approve: false })} disabled={decide.pending}>
                      Decline
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => decide.run({ leaveId: l.id, approve: true })} disabled={decide.pending}>
                      Approve
                    </Button>
                  </>
                ) : (
                  <StatusBadge status={l.status} />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Request leave"
          description="Your manager is notified. Working days are counted for you."
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="leave" loading={request.pending}>
                Send request
              </Button>
            </>
          }
        >
          <form id="leave" className="grid gap-4" action={request.formAction((f) => ({ type: f.get("type"), startDate: f.get("start"), endDate: f.get("end"), reason: f.get("reason") || undefined }))}>
            <Field label="Type" htmlFor="lv-type">
              <Select id="lv-type" name="type" defaultValue="ANNUAL">
                {["ANNUAL", "SICK", "CASUAL", "COMPASSIONATE", "MATERNITY", "PATERNITY", "STUDY", "UNPAID"].map((t) => (
                  <option key={t} value={t}>
                    {humanize(t)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From" htmlFor="lv-start" error={request.errors.startDate}>
                <Input id="lv-start" name="start" type="date" required />
              </Field>
              <Field label="To" htmlFor="lv-end" error={request.errors.endDate}>
                <Input id="lv-end" name="end" type="date" required />
              </Field>
            </div>
            <Field label="Note" htmlFor="lv-reason">
              <Textarea id="lv-reason" name="reason" maxLength={1000} />
            </Field>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
