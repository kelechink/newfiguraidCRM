"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveAccountAction, saveCarrierAction, saveCarrierBankAction } from "@/server/modules/telecom/actions";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { useAction } from "@/ui/use-action";

type Person = { id: string; name: string };
export interface CarrierForm {
  id?: string;
  name: string;
  type: string;
  legalName?: string | null;
  country?: string | null;
  address?: string | null;
  nocEmail?: string | null;
  billingEmail?: string | null;
  ratesEmail?: string | null;
  contacts: { name: string; role?: string; phone?: string; email?: string }[];
  manager?: Person | null;
  nettingEnabled?: boolean;
  notes?: string | null;
  isActive?: boolean;
}

export function CarrierDialog({ carrier, people, trigger }: { carrier?: CarrierForm; people: Person[]; trigger: (open: () => void) => React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(carrier?.type ?? "CUSTOMER");
  const [contacts, setContacts] = useState(carrier?.contacts.length ? carrier.contacts : [{ name: "", role: "", phone: "", email: "" }]);
  const save = useAction(saveCarrierAction, { success: "Carrier saved", onSuccess: (r) => { setOpen(false); if (!carrier) router.push(`/money/telecom/carriers/${r.id}`); } });
  const c = carrier;
  return (
    <>
      {trigger(() => setOpen(true))}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={c ? `Edit ${c.name}` : "New carrier"} className="max-w-[640px]" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="carrier" loading={save.pending}>Save</Button></>}>
          <form
            id="carrier"
            className="grid gap-4"
            action={save.formAction((f) => ({
              id: c?.id,
              name: f.get("name"),
              type,
              legalName: f.get("legal") || undefined,
              country: f.get("country") || undefined,
              address: f.get("address") || undefined,
              nocEmail: f.get("noc") || "",
              billingEmail: f.get("billing") || "",
              ratesEmail: f.get("rates") || "",
              managerId: f.get("manager") || null,
              nettingEnabled: f.get("netting") === "on",
              notes: f.get("notes") || undefined,
              isActive: c ? f.get("active") === "on" : true,
              currency: f.get("currency") ?? "USD",
              contacts: contacts.filter((x) => x.name.trim()).map((x) => ({ name: x.name, role: x.role || undefined, phone: x.phone || undefined, email: x.email || "" })),
            }))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="c-name" error={save.errors.name}><Input id="c-name" name="name" defaultValue={c?.name} required autoFocus /></Field>
              <Field label="Relationship" htmlFor="c-type"><Select id="c-type" value={type} onChange={(e) => setType(e.target.value)}><option value="CUSTOMER">Customer (we sell to them)</option><option value="VENDOR">Vendor (we buy from them)</option><option value="BOTH">Both</option></Select></Field>
              <Field label="Legal name" htmlFor="c-legal"><Input id="c-legal" name="legal" defaultValue={c?.legalName ?? ""} /></Field>
              <Field label="Country" htmlFor="c-country"><Input id="c-country" name="country" defaultValue={c?.country ?? ""} /></Field>
              <Field label="NOC email" htmlFor="c-noc" error={save.errors.nocEmail}><Input id="c-noc" name="noc" type="email" defaultValue={c?.nocEmail ?? ""} /></Field>
              <Field label="Billing email" htmlFor="c-bill" hint="Invoices and statements go here." error={save.errors.billingEmail}><Input id="c-bill" name="billing" type="email" defaultValue={c?.billingEmail ?? ""} /></Field>
              <Field label="Rates email" htmlFor="c-rates" error={save.errors.ratesEmail}><Input id="c-rates" name="rates" type="email" defaultValue={c?.ratesEmail ?? ""} /></Field>
              <Field label="Account manager" htmlFor="c-mgr"><Select id="c-mgr" name="manager" defaultValue={c?.manager?.id ?? ""}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              {!c && <Field label="Account currency" htmlFor="c-cur"><Select id="c-cur" name="currency" defaultValue="USD">{["USD", "NGN", "GBP", "EUR"].map((x) => <option key={x}>{x}</option>)}</Select></Field>}
            </div>
            <Field label="Address" htmlFor="c-addr"><Input id="c-addr" name="address" defaultValue={c?.address ?? ""} /></Field>
            <div className="grid gap-2">
              <p className="text-[12.5px] font-medium text-ink-2">Contacts</p>
              {contacts.map((x, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(["name", "role", "phone", "email"] as const).map((k) => (
                    <Input key={k} aria-label={k} placeholder={k[0]!.toUpperCase() + k.slice(1)} value={x[k] ?? ""} onChange={(e) => setContacts((cs) => cs.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)))} />
                  ))}
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => setContacts((cs) => [...cs, { name: "", role: "", phone: "", email: "" }])}><Plus className="size-3.5" /> Add contact</Button>
            </div>
            <Field label="Notes" htmlFor="c-notes"><Textarea id="c-notes" name="notes" rows={2} defaultValue={c?.notes ?? ""} /></Field>
            <div className="flex flex-wrap gap-5 text-[13px]">
              {type === "BOTH" && <label className="flex items-center gap-2"><input type="checkbox" name="netting" defaultChecked={c?.nettingEnabled} className="accent-[hsl(var(--accent))]" /> Net payables against receivables</label>}
              {c && <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={c.isActive} className="accent-[hsl(var(--accent))]" /> Active</label>}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export interface AccountForm {
  id: string;
  side: string;
  currency: string;
  billingCycleDays: number;
  paymentTermDays: number;
  incrementFirst: number;
  incrementNext: number;
  paymentMode: string;
  creditLimit: number | null;
  lowBalanceAlert: number | null;
  cycleAnchor: string;
}

export function AccountCard({ a, canEdit, canCredit, children }: { a: AccountForm; canEdit: boolean; canCredit: boolean; children?: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const save = useAction(saveAccountAction, { success: "Terms saved", onSuccess: () => setEditing(false) });
  const label = a.side === "VENDOR" ? "Vendor terms (we buy)" : "Customer terms (we sell)";
  return (
    <Card>
      <CardHeader title={label} actions={canEdit && <Button size="sm" variant="secondary" onClick={() => setEditing((e) => !e)}>{editing ? "Close" : "Edit terms"}</Button>} />
      {editing ? (
        <form
          className="grid gap-4"
          action={save.formAction((f) => ({ accountId: a.id, currency: f.get("currency"), billingCycleDays: f.get("cycle"), paymentTermDays: f.get("term"), incrementFirst: f.get("first"), incrementNext: f.get("next"), paymentMode: f.get("mode"), cycleAnchor: f.get("anchor"), ...(canCredit ? { creditLimit: f.get("limit") || null, lowBalanceAlert: f.get("low") || null } : {}) }))}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Currency" htmlFor={`cur-${a.id}`}><Select id={`cur-${a.id}`} name="currency" defaultValue={a.currency}>{["USD", "NGN", "GBP", "EUR"].map((x) => <option key={x}>{x}</option>)}</Select></Field>
            <Field label="Cycle (days)" htmlFor={`cy-${a.id}`} hint="7/3 = 7-day cycle…"><Input id={`cy-${a.id}`} name="cycle" type="number" min={1} max={31} defaultValue={a.billingCycleDays} required /></Field>
            <Field label="Pay within (days)" htmlFor={`te-${a.id}`} hint="…paid 3 days after."><Input id={`te-${a.id}`} name="term" type="number" min={0} max={90} defaultValue={a.paymentTermDays} required /></Field>
            <Field label="First increment (s)" htmlFor={`f-${a.id}`}><Input id={`f-${a.id}`} name="first" type="number" min={1} max={60} defaultValue={a.incrementFirst} required /></Field>
            <Field label="Next increment (s)" htmlFor={`n-${a.id}`}><Input id={`n-${a.id}`} name="next" type="number" min={1} max={60} defaultValue={a.incrementNext} required /></Field>
            <Field label="Payment" htmlFor={`m-${a.id}`}><Select id={`m-${a.id}`} name="mode" defaultValue={a.paymentMode}><option value="POSTPAID">Postpaid</option><option value="PREPAID">Prepaid</option></Select></Field>
            <Field label="First cycle starts" htmlFor={`an-${a.id}`}><Input id={`an-${a.id}`} name="anchor" type="date" defaultValue={a.cycleAnchor} required /></Field>
            {canCredit && <Field label="Credit limit" htmlFor={`l-${a.id}`} hint="Postpaid customers"><Input id={`l-${a.id}`} name="limit" type="number" min={0} step="0.01" defaultValue={a.creditLimit ?? ""} /></Field>}
            {canCredit && <Field label="Low-balance alert" htmlFor={`lb-${a.id}`} hint="Prepaid accounts"><Input id={`lb-${a.id}`} name="low" type="number" min={0} step="0.01" defaultValue={a.lowBalanceAlert ?? ""} /></Field>}
          </div>
          <Button type="submit" variant="primary" loading={save.pending} className="w-fit">Save terms</Button>
        </form>
      ) : (
        children
      )}
    </Card>
  );
}

export function BankDetails({ carrierId, masked, current }: { carrierId: string; masked: string | null; current: string | null }) {
  const [open, setOpen] = useState(false);
  const save = useAction(saveCarrierBankAction, { success: "Bank details saved", onSuccess: () => setOpen(false) });
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[12.5px] text-ink-3">Bank details</p>
          <p className="font-mono text-[13px]">{masked ?? "Not on file"}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{masked ? "Update" : "Add"}</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Carrier bank details" description="Stored encrypted and never shown in full. Saving replaces what's on file; changes are audited and need your password." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="bank" loading={save.pending}>Save</Button></>}>
          <form id="bank" action={save.formAction((f) => ({ carrierId, details: f.get("details") }))}>
            <Field label="Bank, account name, number, SWIFT/IBAN" htmlFor="bk"><Textarea id="bk" name="details" rows={4} defaultValue={current ?? ""} autoComplete="off" /></Field>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
