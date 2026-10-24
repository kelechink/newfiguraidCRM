"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { invoiceTotals } from "@/domain/finance/money";
import { money } from "@/lib/format";
import { saveInvoiceAction } from "@/server/modules/finance/actions";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { useAction } from "@/ui/use-action";

type Line = { description: string; quantity: string; unitPrice: string; vatable: boolean };
export interface InvoiceDraft {
  id?: string;
  kind: "INVOICE" | "QUOTE" | "CREDIT_NOTE";
  unitId: string;
  contactId: string | null;
  currency: string;
  fxRate: number | null;
  issueDate: string;
  dueDate: string;
  vatRate: number;
  notes: string;
  lines: { description: string; quantity: number; unitPrice: number; vatable: boolean }[];
}

const blank = (): Line => ({ description: "", quantity: "1", unitPrice: "", vatable: true });

export function InvoiceEditor({ draft, units, customers, defaultFx }: { draft: InvoiceDraft; units: { id: string; name: string }[]; customers: { id: string; name: string; email: string | null; unitId: string }[]; defaultFx: number }) {
  const router = useRouter();
  const [kind, setKind] = useState(draft.kind);
  const [unitId, setUnitId] = useState(draft.unitId);
  const [contactId, setContactId] = useState(draft.contactId ?? "");
  const [currency, setCurrency] = useState(draft.currency);
  const [vatRate, setVatRate] = useState(String(draft.vatRate));
  const [lines, setLines] = useState<Line[]>(draft.lines.length ? draft.lines.map((l) => ({ description: l.description, quantity: String(l.quantity), unitPrice: String(l.unitPrice), vatable: l.vatable })) : [blank()]);
  const save = useAction(saveInvoiceAction, { success: (r) => `Saved ${r.number}`, onSuccess: (r) => router.push(`/money/invoices/${r.id}`) });

  const totals = useMemo(() => invoiceTotals(lines.map((l) => ({ quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0, vatable: l.vatable })), Number(vatRate) || 0), [lines, vatRate]);
  const unitCustomers = customers.filter((c) => c.unitId === unitId);
  const others = customers.filter((c) => c.unitId !== unitId);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const word = kind === "QUOTE" ? "quote" : kind === "CREDIT_NOTE" ? "credit note" : "invoice";

  return (
    <form
      className="grid gap-4 lg:grid-cols-[1fr_300px]"
      action={save.formAction((f) => ({
        id: draft.id,
        kind,
        unitId,
        contactId: contactId || null,
        currency,
        fxRate: currency === "NGN" ? null : f.get("fx"),
        issueDate: f.get("issue"),
        dueDate: f.get("due"),
        vatRate,
        notes: f.get("notes") || undefined,
        lines: lines.filter((l) => l.description.trim()).map((l) => ({ description: l.description, quantity: l.quantity, unitPrice: l.unitPrice || 0, vatable: l.vatable })),
      }))}
    >
      <div className="grid gap-4">
        <Card className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Type" htmlFor="iv-kind">
              <Select id="iv-kind" value={kind} onChange={(e) => setKind(e.target.value as InvoiceDraft["kind"])} disabled={!!draft.id}>
                <option value="INVOICE">Invoice</option>
                <option value="QUOTE">Quote</option>
                <option value="CREDIT_NOTE">Credit note</option>
              </Select>
            </Field>
            <Field label="Unit" htmlFor="iv-unit">
              <Select id="iv-unit" value={unitId} onChange={(e) => setUnitId(e.target.value)}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
            </Field>
            <Field label="Customer" htmlFor="iv-contact" error={save.errors.contactId}>
              <Select id="iv-contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                <option value="">Choose…</option>
                {unitCustomers.length > 0 && <optgroup label="This unit">{unitCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
                {others.length > 0 && <optgroup label="Other units">{others.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Issued" htmlFor="iv-issue" error={save.errors.issueDate}><Input id="iv-issue" name="issue" type="date" defaultValue={draft.issueDate} required /></Field>
            <Field label={kind === "QUOTE" ? "Valid until" : "Due"} htmlFor="iv-due" error={save.errors.dueDate}><Input id="iv-due" name="due" type="date" defaultValue={draft.dueDate} required /></Field>
            <Field label="Currency" htmlFor="iv-cur"><Select id="iv-cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>{["NGN", "USD", "GBP", "EUR"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="VAT %" htmlFor="iv-vat" error={save.errors.vatRate}><Input id="iv-vat" type="number" min={0} max={50} step="0.01" value={vatRate} onChange={(e) => setVatRate(e.target.value)} /></Field>
          </div>
          {currency !== "NGN" && (
            <Field label={`Rate (₦ per ${currency})`} htmlFor="iv-fx" hint="Used to report this invoice in naira." error={save.errors.fxRate}>
              <Input id="iv-fx" name="fx" type="number" step="0.0001" min={0} defaultValue={draft.fxRate ?? (currency === "USD" ? defaultFx : "")} required className="sm:max-w-[200px]" />
            </Field>
          )}
        </Card>

        <Card padded={false}>
          <div className="hidden grid-cols-[1fr_80px_130px_56px_120px_32px] gap-2 border-b border-line px-4 py-2 text-2xs font-medium uppercase tracking-[0.04em] text-ink-3 sm:grid">
            <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit price</span><span className="text-center">VAT</span><span className="text-right">Amount</span><span />
          </div>
          <ul>
            {lines.map((l, i) => (
              <li key={i} className="grid grid-cols-[1fr_80px] gap-2 border-b border-line px-4 py-2.5 last:border-0 sm:grid-cols-[1fr_80px_130px_56px_120px_32px] sm:items-center">
                <Input aria-label="Description" placeholder="e.g. Business hosting, 12 months" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} className="col-span-2 sm:col-span-1" />
                <Input aria-label="Quantity" type="number" min={0} step="any" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} className="text-right" />
                <Input aria-label="Unit price" type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} className="text-right" />
                <label className="flex items-center justify-center gap-1.5 text-[12px] text-ink-3"><input type="checkbox" checked={l.vatable} onChange={(e) => setLine(i, { vatable: e.target.checked })} className="accent-[hsl(var(--accent))]" /><span className="sm:sr-only">VAT</span></label>
                <span className="self-center text-right text-[13px] font-medium tabular">{money(totals.lines[i] ?? 0, currency)}</span>
                <button type="button" aria-label="Remove line" onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [blank()]))} className="grid size-7 place-items-center justify-self-end rounded-md text-ink-3 hover:bg-surface-2 hover:text-danger"><Trash2 className="size-3.5" /></button>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-2.5">
            <Button type="button" size="sm" variant="ghost" onClick={() => setLines((ls) => [...ls, blank()])}><Plus className="size-3.5" /> Add line</Button>
            {save.errors.lines && <p className="mt-1 text-[12px] text-danger">{save.errors.lines}</p>}
          </div>
        </Card>

        <Card>
          <Field label="Notes on the document" htmlFor="iv-notes" hint="Payment terms, scope or delivery notes. Shown to the customer.">
            <Textarea id="iv-notes" name="notes" rows={3} defaultValue={draft.notes} maxLength={2000} />
          </Field>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Card className="grid gap-3">
          <dl className="grid gap-2 text-[13px]">
            <div className="flex justify-between"><dt className="text-ink-3">Subtotal</dt><dd className="tabular">{money(totals.subtotal, currency)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-3">VAT {Number(vatRate) || 0}%</dt><dd className="tabular">{money(totals.vatAmount, currency)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 text-[15px] font-semibold"><dt>Total</dt><dd className="tabular">{money(totals.total, currency)}</dd></div>
          </dl>
          <Button type="submit" variant="primary" loading={save.pending} className="w-full justify-center">{draft.id ? "Save changes" : `Save ${word} as draft`}</Button>
          <p className="text-2xs text-ink-3">Drafts get their number now. You can review, download and send from the next screen.</p>
        </Card>
      </aside>
    </form>
  );
}
