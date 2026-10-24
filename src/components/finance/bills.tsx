"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { localDate } from "@/domain/sop/schedule";
import { describeDue, money } from "@/lib/format";
import { approveBillAction, createBillAction, payBillAction } from "@/server/modules/finance/actions";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { UNIT_STYLE } from "@/ui/units";
import { useAction } from "@/ui/use-action";

type Row = { id: string; number: string | null; unit: string; supplier: string; currency: string; total: number; amountPaid: number; issueDate: string; dueDate: string; status: string; period: string | null };

export function BillsTable({ rows, units, canCreate, canApprove }: { rows: Row[]; units: { id: string; name: string }[]; canCreate: boolean; canApprove: boolean }) {
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState<Row | null>(null);
  const create = useAction(createBillAction, { success: "Bill added", onSuccess: () => setOpen(false) });
  const approve = useAction(approveBillAction, { success: "Approved" });
  const pay = useAction(payBillAction, { success: "Payment recorded", onSuccess: () => setPaying(null) });
  const [cur, setCur] = useState("NGN");
  return (
    <div className="grid gap-4">
      <div className="flex justify-between gap-3">
        <p className="text-[13px] text-ink-3">Supplier bills and telecom vendor statements, soonest due first.</p>
        {canCreate && <Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-3.5" /> Add bill</Button>}
      </div>
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Supplier</Th><Th>Due</Th><Th align="right">Total</Th><Th align="right">Balance</Th><Th>Status</Th><Th /></tr></THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={6}>No bills.</TableEmpty>}
            {rows.map((b) => {
              const due = b.status === "PAID" ? null : describeDue(`${b.dueDate}T17:00:00+01:00`);
              return (
                <Tr key={b.id}>
                  <Td>
                    <p className="flex items-center gap-1.5 font-medium"><span className={cn("size-1.5 rounded-full", UNIT_STYLE[b.unit]?.dot)} />{b.supplier}</p>
                    <p className="text-2xs text-ink-3">{b.number ?? "No number"}{b.period && ` · ${b.period}`}</p>
                  </Td>
                  <Td className={cn(due?.tone === "overdue" && "font-medium text-danger")}>{due ? due.label : "—"}</Td>
                  <Td align="right">{money(b.total, b.currency)}</Td>
                  <Td align="right" className="font-medium">{money(b.total - b.amountPaid, b.currency)}</Td>
                  <Td><StatusBadge status={b.status} /></Td>
                  <Td align="right">
                    {canApprove && b.status === "DRAFT" && <Button size="sm" variant="secondary" onClick={() => approve.run(b.id)} disabled={approve.pending}>Approve</Button>}
                    {canApprove && ["APPROVED", "PARTIALLY_PAID"].includes(b.status) && <Button size="sm" variant="primary" onClick={() => setPaying(b)}>Record payment</Button>}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add a bill" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="bill" loading={create.pending}>Save</Button></>}>
          <form id="bill" className="grid gap-4" action={create.formAction((f) => ({ unitId: f.get("unit"), supplierName: f.get("supplier"), number: f.get("number") || undefined, currency: cur, fxRate: cur === "NGN" ? null : f.get("fx"), total: f.get("total"), issueDate: f.get("issue"), dueDate: f.get("due") }))}>
            <Field label="Supplier" htmlFor="b-sup"><Input id="b-sup" name="supplier" required autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
              <Field label="Total" htmlFor="b-tot"><Input id="b-tot" name="total" type="number" min={0} step="0.01" required /></Field>
              <Field label="Currency" htmlFor="b-cur"><Select id="b-cur" value={cur} onChange={(e) => setCur(e.target.value)}>{["NGN", "USD", "GBP", "EUR"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            </div>
            {cur !== "NGN" && <Field label="Rate to NGN" htmlFor="b-fx"><Input id="b-fx" name="fx" type="number" step="0.0001" required /></Field>}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Number" htmlFor="b-num"><Input id="b-num" name="number" /></Field>
              <Field label="Issued" htmlFor="b-iss"><Input id="b-iss" name="issue" type="date" defaultValue={localDate(new Date())} required /></Field>
              <Field label="Due" htmlFor="b-due"><Input id="b-due" name="due" type="date" required /></Field>
            </div>
            <Field label="Unit" htmlFor="b-unit"><Select id="b-unit" name="unit">{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        {paying && (
          <DialogContent title={`Pay ${paying.supplier}`} footer={<><Button variant="ghost" onClick={() => setPaying(null)}>Cancel</Button><Button variant="primary" type="submit" form="pay" loading={pay.pending}>Record</Button></>}>
            <form id="pay" action={pay.formAction((f) => ({ billId: paying.id, amount: f.get("amount") }))}>
              <Field label={`Amount (${paying.currency})`} htmlFor="p-amt"><Input id="p-amt" name="amount" type="number" step="0.01" min={0} defaultValue={(paying.total - paying.amountPaid).toFixed(2)} required /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
