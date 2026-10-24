"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { localDate } from "@/domain/sop/schedule";
import { exportFinanceAction } from "@/server/modules/finance/actions";
import { Button } from "@/ui/button";
import { Dialog, DialogContent } from "@/ui/dialog";
import { downloadText } from "@/ui/download";
import { Field, Input, Select } from "@/ui/field";
import { useAction } from "@/ui/use-action";

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const today = localDate(new Date());
  const exp = useAction(exportFinanceAction, { refresh: false, success: "Export ready — it's been logged", onSuccess: (r) => (downloadText(r.filename, r.csv, "text/csv"), setOpen(false)) });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Download className="size-3.5" /> Export for accountant</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Export to CSV" description="Exports are watermarked with your name and recorded in the audit log." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="exp" loading={exp.pending}>Download</Button></>}>
          <form id="exp" className="grid gap-4" action={exp.formAction((f) => ({ kind: f.get("kind"), from: f.get("from"), to: f.get("to") }))}>
            <Field label="What" htmlFor="x-kind"><Select id="x-kind" name="kind"><option value="payments">Income (payments)</option><option value="expenses">Expenses</option><option value="invoices">Invoices</option></Select></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="From" htmlFor="x-from"><Input id="x-from" name="from" type="date" defaultValue={`${today.slice(0, 7)}-01`} required /></Field>
              <Field label="To" htmlFor="x-to"><Input id="x-to" name="to" type="date" defaultValue={today} required /></Field>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
