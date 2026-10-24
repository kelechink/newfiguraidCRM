"use client";

import { Download, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adjustPayslipAction, bankScheduleAction, createRunAction, payslipPdfAction, recalculateRunAction, transitionRunAction } from "@/server/modules/hr/actions";
import { Button } from "@/ui/button";
import { ConfirmButton } from "@/ui/confirm";
import { Dialog, DialogContent } from "@/ui/dialog";
import { downloadBase64, downloadText } from "@/ui/download";
import { Field, Input } from "@/ui/field";
import { useAction } from "@/ui/use-action";

export function NewRunButton({ defaultMonth }: { defaultMonth: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const create = useAction(createRunAction, { success: "Payroll drafted", onSuccess: (r) => router.push(`/team/payroll/${r.id}`) });
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-3.5" /> Run payroll</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Run payroll" description="Builds a draft payslip for everyone with pay set, using this month's attendance deductions, leave, excuses and holidays." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="run" loading={create.pending}>Draft payroll</Button></>}>
          <form id="run" action={create.formAction((f) => ({ periodMonth: f.get("month") }))}>
            <Field label="Month" htmlFor="run-m" error={create.errors.periodMonth}><Input id="run-m" name="month" type="month" defaultValue={defaultMonth} required /></Field>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Line = { name: string; amount: number };

export function RunActions({ run, can }: { run: { id: string; status: string; needsSignoff: boolean; preparedById: string }; can: { edit: boolean; approve: boolean; signoff: boolean; export: boolean; isPreparer: boolean } }) {
  const t = useAction(transitionRunAction, { success: "Updated" });
  const recalc = useAction(recalculateRunAction, { success: "Recalculated" });
  const bank = useAction(bankScheduleAction, { refresh: false, onSuccess: (r) => downloadText(r.filename, r.csv, "text/csv") });
  const go = (to: string) => t.run({ runId: run.id, to });
  const s = run.status;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {can.edit && s === "DRAFT" && <Button variant="secondary" onClick={() => recalc.run(run.id)} loading={recalc.pending}>Recalculate</Button>}
      {can.edit && ["DRAFT", "IN_REVIEW"].includes(s) && <ConfirmButton title="Cancel this run?" body="Payslips are discarded. You can draft the month again." confirmLabel="Cancel run" danger onConfirm={() => go("cancel")}><Button variant="ghost">Cancel run</Button></ConfirmButton>}
      {can.edit && ["IN_REVIEW", "APPROVED"].includes(s) && <Button variant="ghost" onClick={() => go("reopen")}>Back to draft</Button>}
      {can.edit && s === "DRAFT" && <Button variant="primary" onClick={() => go("submit")} loading={t.pending}>Submit for approval</Button>}
      {can.approve && s === "IN_REVIEW" && <Button variant="primary" onClick={() => go("approve")} loading={t.pending} disabled={can.isPreparer} title={can.isPreparer ? "Someone other than the preparer must approve" : undefined}>Approve</Button>}
      {can.signoff && s === "APPROVED" && run.needsSignoff && <Button variant="primary" onClick={() => go("signoff")} loading={t.pending}>Sign off</Button>}
      {can.export && (s === "SIGNED_OFF" || s === "PAID" || (s === "APPROVED" && !run.needsSignoff)) && <Button variant="secondary" onClick={() => bank.run(run.id)} loading={bank.pending}><Download className="size-3.5" /> Bank schedule</Button>}
      {can.approve && (s === "SIGNED_OFF" || (s === "APPROVED" && !run.needsSignoff)) && (
        <ConfirmButton title="Mark payroll as paid?" body="Attendance for the month is locked, deductions are attached to payslips and every staff member is told their payslip is ready." confirmLabel="Mark paid" onConfirm={() => go("paid")}>
          <Button variant="primary">Mark as paid</Button>
        </ConfirmButton>
      )}
    </div>
  );
}

export function PayslipButton({ id, label = "PDF" }: { id: string; label?: string }) {
  const pdf = useAction(payslipPdfAction, { refresh: false, onSuccess: (r) => downloadBase64(r.filename, r.base64) });
  return <Button size="sm" variant="ghost" onClick={() => pdf.run(id)} loading={pdf.pending}><Download className="size-3.5" /> {label}</Button>;
}

export function AdjustButton({ payslipId, name, adjustments }: { payslipId: string; name: string; adjustments: { bonuses: Line[]; other: Line[] } }) {
  const [open, setOpen] = useState(false);
  const [bonuses, setBonuses] = useState(adjustments.bonuses.map((b) => ({ name: b.name, amount: String(b.amount) })));
  const [other, setOther] = useState(adjustments.other.map((b) => ({ name: b.name, amount: String(b.amount) })));
  const save = useAction(adjustPayslipAction, { success: "Payslip updated", onSuccess: () => setOpen(false) });
  const list = (rows: { name: string; amount: string }[], set: (f: (r: { name: string; amount: string }[]) => { name: string; amount: string }[]) => void, label: string) => (
    <div className="grid gap-2">
      <p className="text-[12.5px] font-medium text-ink-2">{label}</p>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_130px_32px] gap-2">
          <Input aria-label="Name" value={r.name} onChange={(e) => set((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <Input aria-label="Amount" type="number" min={0} value={r.amount} onChange={(e) => set((rs) => rs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className="text-right" />
          <button type="button" aria-label="Remove" onClick={() => set((rs) => rs.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-danger"><Trash2 className="size-3.5" /></button>
        </div>
      ))}
      <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => set((rs) => [...rs, { name: "", amount: "" }])}><Plus className="size-3.5" /> Add</Button>
    </div>
  );
  const clean = (rows: { name: string; amount: string }[]) => rows.filter((r) => r.name.trim() && Number(r.amount) > 0).map((r) => ({ name: r.name, amount: r.amount }));
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Adjust</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={`Adjust ${name}`} description="One-off bonuses and deductions for this run only." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => save.run({ payslipId, bonuses: clean(bonuses), other: clean(other) })} loading={save.pending}>Save</Button></>}>
          <div className="grid gap-5">
            {list(bonuses, setBonuses, "Bonuses")}
            {list(other, setOther, "Other deductions")}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
