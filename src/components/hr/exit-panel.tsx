"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { localDate } from "@/domain/sop/schedule";
import { money } from "@/lib/format";
import { closeExitAction, finalPayAction, openExitAction, revokeAccessAction, toggleExitItemAction } from "@/server/modules/hr/actions";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { cn } from "@/ui/cn";
import { ConfirmButton } from "@/ui/confirm";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { humanize, StatusBadge } from "@/ui/status";
import { useAction } from "@/ui/use-action";

type Exit = { id: string; type: string; noticeDate: string; lastWorkingDay: string; reason: string | null; checklist: { item: string; done: boolean; by: string | null }[]; finalPay: { gross: number; net: number; notes: string[] } | null; accessRevokedAt: string | null; status: string; handledBy: string };

export function ExitPanel({ userId, name, exit, canEdit, canPay }: { userId: string; name: string; exit: Exit | null; canEdit: boolean; canPay: boolean }) {
  const [open, setOpen] = useState(false);
  const start = useAction(openExitAction, { success: "Exit opened", onSuccess: () => setOpen(false) });
  const toggle = useAction(toggleExitItemAction);
  const pay = useAction(finalPayAction, { success: "Final pay computed" });
  const revoke = useAction(revokeAccessAction, { success: "Access revoked" });
  const close = useAction(closeExitAction, { success: "Exit closed" });

  if (!exit || exit.status === "closed") {
    return (
      <Card>
        <CardHeader title="Exit" description={exit ? `Closed exit (${humanize(exit.type)}, last day ${exit.lastWorkingDay}).` : "No exit in progress."} actions={canEdit && <Button variant="secondary" onClick={() => setOpen(true)}>Start exit</Button>} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent title={`Exit for ${name}`} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="exit" loading={start.pending}>Open exit</Button></>}>
            <form id="exit" className="grid gap-4" action={start.formAction((f) => ({ userId, type: f.get("type"), noticeDate: f.get("notice"), lastWorkingDay: f.get("last"), reason: f.get("reason") || undefined }))}>
              <Field label="Type" htmlFor="ex-type"><Select id="ex-type" name="type"><option value="RESIGNATION">Resignation</option><option value="END_OF_CONTRACT">End of contract</option><option value="TERMINATION">Termination</option></Select></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Notice given" htmlFor="ex-notice"><Input id="ex-notice" name="notice" type="date" defaultValue={localDate(new Date())} required /></Field>
                <Field label="Last working day" htmlFor="ex-last" error={start.errors.lastWorkingDay}><Input id="ex-last" name="last" type="date" required /></Field>
              </div>
              <Field label="Reason (internal)" htmlFor="ex-reason"><Textarea id="ex-reason" name="reason" rows={3} /></Field>
            </form>
          </DialogContent>
        </Dialog>
      </Card>
    );
  }
  const done = exit.checklist.filter((i) => i.done).length;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardHeader title={`${humanize(exit.type)} · last day ${exit.lastWorkingDay}`} description={`${done} of ${exit.checklist.length} handover items done · handled by ${exit.handledBy}`} actions={<StatusBadge status={exit.status.toUpperCase()} />} />
        <ul className="grid gap-1">
          {exit.checklist.map((i, idx) => (
            <li key={i.item}>
              <button type="button" disabled={!canEdit || toggle.pending} onClick={() => toggle.run({ exitId: exit.id, index: idx, done: !i.done })} className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2 disabled:cursor-default">
                <span className={cn("grid size-4 shrink-0 place-items-center rounded border", i.done ? "border-success bg-success text-white" : "border-line-strong")}>{i.done && <Check className="size-3" />}</span>
                <span className={cn("flex-1", i.done && "text-ink-3 line-through")}>{i.item}</span>
                {i.by && <span className="text-2xs text-ink-3">{i.by}</span>}
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <aside className="grid content-start gap-4">
        {canPay && (
          <Card>
            <CardHeader title="Final pay" />
            {exit.finalPay ? (
              <dl className="grid gap-1 text-[13px]">
                <div className="flex justify-between"><dt className="text-ink-3">Gross</dt><dd className="tabular">{money(exit.finalPay.gross)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Net</dt><dd className="tabular">{money(exit.finalPay.net)}</dd></div>
                {exit.finalPay.notes.map((n) => <p key={n} className="text-2xs text-ink-3">{n}</p>)}
              </dl>
            ) : <p className="text-[13px] text-ink-3">Not computed yet.</p>}
            {canEdit && <Button size="sm" variant="secondary" className="mt-3" onClick={() => pay.run(exit.id)} loading={pay.pending}>{exit.finalPay ? "Recompute" : "Compute"}</Button>}
          </Card>
        )}
        <Card>
          <CardHeader title="Access" description={exit.accessRevokedAt ? `Revoked ${new Date(exit.accessRevokedAt).toLocaleString("en-GB")}` : "Still signed in and able to use the app."} />
          {canEdit && !exit.accessRevokedAt && (
            <ConfirmButton title={`Revoke ${name}'s access?`} body="Their status becomes Exited, every session ends now, special grants are revoked and invite or reset links stop working. You'll be asked for your password." confirmLabel="Revoke access" danger onConfirm={() => revoke.run(exit.id)}>
              <Button variant="danger" size="sm">Revoke access</Button>
            </ConfirmButton>
          )}
          {canEdit && exit.accessRevokedAt && exit.status !== "closed" && <Button size="sm" variant="secondary" onClick={() => close.run(exit.id)} loading={close.pending}>Close exit</Button>}
        </Card>
      </aside>
    </div>
  );
}
