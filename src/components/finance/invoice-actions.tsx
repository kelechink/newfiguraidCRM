"use client";

import { Ban, Download, FileCheck2, Pencil, Send, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { localDate } from "@/domain/sop/schedule";
import { convertQuoteAction, invoicePdfAction, recordInvoicePaymentAction, sendInvoiceAction, voidInvoiceAction } from "@/server/modules/finance/actions";
import { Button } from "@/ui/button";
import { ConfirmButton } from "@/ui/confirm";
import { Dialog, DialogContent } from "@/ui/dialog";
import { downloadBase64 } from "@/ui/download";
import { Field, Input, Select } from "@/ui/field";
import { useAction } from "@/ui/use-action";

export function InvoiceActions({
  invoice,
  can,
  banks,
}: {
  invoice: { id: string; number: string; kind: string; status: string; currency: string; outstanding: number; hasEmail: boolean };
  can: { edit: boolean; send: boolean; pay: boolean; void: boolean; convert: boolean };
  banks: { id: string; name: string; currency: string }[];
}) {
  const router = useRouter();
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const pdf = useAction(invoicePdfAction, { refresh: false, onSuccess: (r) => downloadBase64(r.filename, r.base64) });
  const send = useAction(sendInvoiceAction, { success: "Sent to the customer" });
  const convert = useAction(convertQuoteAction, { success: "Invoice drafted from quote", onSuccess: (r) => router.push(`/money/invoices/${r.id}`) });
  const pay = useAction(recordInvoicePaymentAction, { success: "Payment recorded", onSuccess: () => setPaying(false) });
  const voidIt = useAction(voidInvoiceAction, { success: "Invoice voided", onSuccess: () => setVoiding(false) });
  const word = invoice.kind === "QUOTE" ? "quote" : "invoice";
  const open = ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={() => pdf.run(invoice.id)} loading={pdf.pending}><Download className="size-3.5" /> PDF</Button>
      {can.edit && invoice.status === "DRAFT" && <Link href={`/money/invoices/new?id=${invoice.id}`} className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-surface px-3 text-[13px] shadow-card hover:bg-surface-2"><Pencil className="size-3.5" /> Edit</Link>}
      {can.void && !["VOID", "PAID"].includes(invoice.status) && invoice.kind !== "QUOTE" && <Button variant="ghost" onClick={() => setVoiding(true)}><Ban className="size-3.5" /> Void</Button>}
      {can.convert && invoice.kind === "QUOTE" && !["ACCEPTED", "DECLINED", "VOID"].includes(invoice.status) && (
        <ConfirmButton title="Convert to invoice?" body="A draft invoice is created with the same lines, and this quote is marked accepted." confirmLabel="Convert" onConfirm={() => convert.run(invoice.id)}>
          <Button variant="secondary"><FileCheck2 className="size-3.5" /> Convert to invoice</Button>
        </ConfirmButton>
      )}
      {can.send && !["VOID", "PAID", "ACCEPTED", "DECLINED"].includes(invoice.status) && (
        <Button variant={invoice.status === "DRAFT" ? "primary" : "secondary"} onClick={() => send.run(invoice.id)} loading={send.pending} disabled={!invoice.hasEmail} title={invoice.hasEmail ? undefined : "Add an email address for the customer first"}>
          <Send className="size-3.5" /> {invoice.status === "DRAFT" ? `Send ${word}` : "Resend"}
        </Button>
      )}
      {can.pay && open && invoice.kind === "INVOICE" && <Button variant="primary" onClick={() => setPaying(true)}><Wallet className="size-3.5" /> Record payment</Button>}

      <Dialog open={paying} onOpenChange={setPaying}>
        <DialogContent title={`Payment for ${invoice.number}`} description="For bank transfers and cash. Paystack payments are recorded automatically." footer={<><Button variant="ghost" onClick={() => setPaying(false)}>Cancel</Button><Button variant="primary" type="submit" form="ipay" loading={pay.pending}>Record</Button></>}>
          <form id="ipay" className="grid gap-4" action={pay.formAction((f) => ({ invoiceId: invoice.id, amount: f.get("amount"), method: f.get("method"), receivedAt: f.get("date"), reference: f.get("ref") || undefined, bankAccountId: f.get("bank") || null }))}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Amount (${invoice.currency})`} htmlFor="ip-amt" error={pay.errors.amount}><Input id="ip-amt" name="amount" type="number" step="0.01" min={0} defaultValue={invoice.outstanding.toFixed(2)} required autoFocus /></Field>
              <Field label="Date received" htmlFor="ip-date"><Input id="ip-date" name="date" type="date" defaultValue={localDate(new Date())} required /></Field>
              <Field label="Method" htmlFor="ip-method"><Select id="ip-method" name="method" defaultValue="BANK_TRANSFER"><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option><option value="POS">POS</option><option value="CARD">Card</option><option value="OTHER">Other</option></Select></Field>
              <Field label="Bank reference" htmlFor="ip-ref"><Input id="ip-ref" name="ref" /></Field>
            </div>
            {banks.length > 0 && <Field label="Into account" htmlFor="ip-bank"><Select id="ip-bank" name="bank" defaultValue=""><option value="">—</option>{banks.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>)}</Select></Field>}
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={voiding} onOpenChange={setVoiding}>
        <DialogContent title={`Void ${invoice.number}?`} description="The number stays used and the invoice is kept for the audit trail. You'll be asked for your password." footer={<><Button variant="ghost" onClick={() => setVoiding(false)}>Cancel</Button><Button variant="danger" type="submit" form="ivoid" loading={voidIt.pending}>Void invoice</Button></>}>
          <form id="ivoid" action={voidIt.formAction((f) => ({ invoiceId: invoice.id, reason: f.get("reason") }))}>
            <Field label="Reason" htmlFor="iv-reason" error={voidIt.errors.reason}><Input id="iv-reason" name="reason" required minLength={3} placeholder="e.g. Issued to the wrong company" /></Field>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
