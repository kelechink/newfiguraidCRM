"use client";

import { Check, Paperclip, Plus, X } from "lucide-react";
import { useState } from "react";
import { localDate } from "@/domain/sop/schedule";
import { formatDay, money } from "@/lib/format";
import { createExpenseAction, decideExpenseAction, markExpensePaidAction } from "@/server/modules/finance/actions";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { UNIT_STYLE } from "@/ui/units";
import { useAction } from "@/ui/use-action";

type Row = {
  id: string;
  unit: string;
  category: string;
  description: string;
  vendor: string | null;
  amount: number;
  currency: string;
  amountNgn: number;
  incurredOn: string;
  status: string;
  submittedBy: { id: string; name: string };
  approvedBy: string | null;
  rejectionNote: string | null;
  receiptUrl: string | null;
  canDecide: boolean;
};

export function NewExpenseButton({ categories, units, rates }: { categories: { id: string; name: string }[]; units: { id: string; name: string }[]; rates: Record<string, number> }) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("NGN");
  const save = useAction(createExpenseAction, { success: "Expense submitted for approval", onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-3.5" /> Log expense</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Log an expense" description="Attach a receipt photo or PDF. Finance approves it before it's paid." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="exp-form" loading={save.pending}>Submit</Button></>}>
          <form
            id="exp-form"
            className="grid gap-4"
            action={(f) => {
              f.set("currency", currency);
              void save.run(f as never);
            }}
          >
            <Field label="What was it for?" htmlFor="e-desc" error={save.errors.description}><Input id="e-desc" name="description" required autoFocus placeholder="e.g. Diesel for office generator" /></Field>
            <div className="grid gap-4 sm:grid-cols-[1fr_100px]">
              <Field label="Amount" htmlFor="e-amt"><Input id="e-amt" name="amount" type="number" min={0} step="0.01" required /></Field>
              <Field label="Currency" htmlFor="e-cur"><Select id="e-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>{["NGN", "USD", "GBP", "EUR"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            </div>
            {currency !== "NGN" && <Field label={`Rate (₦ per ${currency})`} htmlFor="e-fx"><Input key={currency} id="e-fx" name="fxRate" type="number" step="0.0001" min={0} defaultValue={rates[currency] ?? ""} required /></Field>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="e-cat"><Select id="e-cat" name="categoryId" required>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              <Field label="Unit" htmlFor="e-unit"><Select id="e-unit" name="unitId">{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
              <Field label="Date" htmlFor="e-date"><Input id="e-date" name="incurredOn" type="date" defaultValue={localDate(new Date())} required /></Field>
              <Field label="Vendor" htmlFor="e-vendor"><Input id="e-vendor" name="vendor" /></Field>
            </div>
            <Field label="Receipt" htmlFor="e-receipt" hint="Photo or PDF, up to 10 MB."><Input id="e-receipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" capture="environment" className="h-auto py-1.5" /></Field>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ExpensesTable({ rows, banks, canPay }: { rows: Row[]; banks: { id: string; name: string }[]; canPay: boolean }) {
  const decide = useAction(decideExpenseAction, { success: "Saved" });
  const pay = useAction(markExpensePaidAction, { success: "Marked paid" });
  const [rejecting, setRejecting] = useState<Row | null>(null);
  return (
    <Card padded={false}>
      <Table>
        <THead><tr><Th>Date</Th><Th>Expense</Th><Th>By</Th><Th align="right">Amount</Th><Th>Status</Th><Th /></tr></THead>
        <tbody>
          {rows.length === 0 && <TableEmpty colSpan={6}>No expenses here.</TableEmpty>}
          {rows.map((e) => (
            <Tr key={e.id}>
              <Td muted className="whitespace-nowrap">{formatDay(e.incurredOn, { weekday: true })}</Td>
              <Td>
                <p className="flex items-center gap-1.5 font-medium"><span className={cn("size-1.5 rounded-full", UNIT_STYLE[e.unit]?.dot)} />{e.description}</p>
                <p className="text-2xs text-ink-3">{e.category}{e.vendor && ` · ${e.vendor}`}{e.rejectionNote && <span className="text-danger"> · {e.rejectionNote}</span>}</p>
              </Td>
              <Td><span className="inline-flex items-center gap-1.5 text-[12.5px]"><Avatar id={e.submittedBy.id} name={e.submittedBy.name} size={20} />{e.submittedBy.name}</span></Td>
              <Td align="right"><span className="font-medium">{money(e.amount, e.currency)}</span>{e.currency !== "NGN" && <span className="block text-2xs text-ink-3">{money(e.amountNgn)}</span>}</Td>
              <Td><StatusBadge status={e.status} /></Td>
              <Td align="right">
                <div className="flex items-center justify-end gap-1.5">
                  {e.receiptUrl && <a href={e.receiptUrl} target="_blank" rel="noreferrer" className="rounded p-1 text-ink-3 hover:text-ink" aria-label="View receipt" title="View receipt"><Paperclip className="size-3.5" /></a>}
                  {e.canDecide && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setRejecting(e)}><X className="size-3.5" /> Reject</Button>
                      <Button size="sm" variant="primary" onClick={() => decide.run({ expenseId: e.id, approve: true })} disabled={decide.pending}><Check className="size-3.5" /> Approve</Button>
                    </>
                  )}
                  {canPay && e.status === "APPROVED" && <Button size="sm" variant="secondary" onClick={() => pay.run({ expenseId: e.id, bankAccountId: banks[0]?.id ?? null })} disabled={pay.pending}>Mark paid</Button>}
                </div>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        {rejecting && (
          <DialogContent title="Reject expense" description={rejecting.description} footer={<><Button variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button><Button variant="danger" type="submit" form="rej">Reject</Button></>}>
            <form id="rej" action={decide.formAction((f) => (setRejecting(null), { expenseId: rejecting.id, approve: false, note: f.get("note") }))}>
              <Field label="Reason" htmlFor="rej-note"><Input id="rej-note" name="note" required placeholder="e.g. No receipt attached" /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
