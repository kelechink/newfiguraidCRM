"use client";

import { Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createContactAction } from "@/server/modules/crm/actions";
import { Button } from "@/ui/button";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { useAction } from "@/ui/use-action";

export const SOURCES: [string, string][] = [
  ["WHATSAPP", "WhatsApp"], ["INSTAGRAM", "Instagram"], ["FACEBOOK", "Facebook"], ["EMAIL", "Email"], ["WEBCHAT", "Website chat"],
  ["LINKEDIN", "LinkedIn"], ["PHONE", "Phone call"], ["SMS", "SMS"], ["FORM", "Web form"], ["REFERRAL", "Referral"], ["META_AD", "Meta ad"],
  ["WALK_IN", "Walk-in"], ["TENDER", "Tender"], ["IMPORT", "Import"], ["OTHER", "Other"],
];

export function ContactFilters({ initial }: { initial: Record<string, string | undefined> }) {
  const router = useRouter();
  const go = (patch: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries({ ...initial, ...patch, page: "1" }).filter(([, v]) => v) as [string, string][]);
    router.push(`/customers/contacts?${p}`);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        className="relative w-full max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          go({ q: String(new FormData(e.currentTarget).get("q") ?? "") });
        }}
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
        <Input name="q" defaultValue={initial.q} placeholder="Name, email, phone or company" className="pl-8" aria-label="Search contacts" />
      </form>
      <Select value={initial.lifecycle ?? ""} onChange={(e) => go({ lifecycle: e.target.value })} className="w-auto" aria-label="Stage">
        <option value="">All stages</option>
        {["LEAD", "QUALIFIED", "CUSTOMER", "CHURNED", "ARCHIVED"].map((l) => <option key={l} value={l}>{l[0] + l.slice(1).toLowerCase()}</option>)}
      </Select>
      <Select value={initial.owner ?? ""} onChange={(e) => go({ owner: e.target.value })} className="w-auto" aria-label="Owner">
        <option value="">Any owner</option>
        <option value="me">Mine</option>
        <option value="none">Unassigned</option>
      </Select>
      <Select value={initial.source ?? ""} onChange={(e) => go({ source: e.target.value })} className="w-auto" aria-label="Source">
        <option value="">Any source</option>
        {SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </Select>
    </div>
  );
}

export function NewContactButton({ units, owners, defaultUnitId }: { units: { id: string; name: string }[]; owners: { id: string; name: string }[]; defaultUnitId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const create = useAction(createContactAction, { success: "Contact added", onSuccess: (r) => (setOpen(false), router.push(`/customers/contacts/${r.id}`)) });
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-3.5" /> New contact</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="New contact"
          description="We check for duplicates by email and phone."
          footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="new-contact" loading={create.pending}>Add contact</Button></>}
        >
          <form
            id="new-contact"
            className="grid gap-4"
            action={create.formAction((f) => ({
              firstName: f.get("first") || undefined,
              lastName: f.get("last") || undefined,
              email: f.get("email") || undefined,
              phone: f.get("phone") || undefined,
              companyName: f.get("company") || undefined,
              unitId: f.get("unit"),
              ownerId: f.get("owner") || null,
              sourceChannel: f.get("source") || undefined,
            }))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="c-first"><Input id="c-first" name="first" autoFocus /></Field>
              <Field label="Last name" htmlFor="c-last"><Input id="c-last" name="last" /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="c-email"><Input id="c-email" name="email" type="email" /></Field>
              <Field label="Phone" htmlFor="c-phone" hint="Nigerian numbers are formatted for you."><Input id="c-phone" name="phone" type="tel" placeholder="0803 123 4567" /></Field>
            </div>
            <Field label="Company" htmlFor="c-company"><Input id="c-company" name="company" /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Unit" htmlFor="c-unit">
                <Select id="c-unit" name="unit" defaultValue={defaultUnitId}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
              </Field>
              <Field label="Owner" htmlFor="c-owner">
                <Select id="c-owner" name="owner" defaultValue=""><option value="">Me</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
              </Field>
              <Field label="Source" htmlFor="c-source">
                <Select id="c-source" name="source" defaultValue="OTHER">{SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
              </Field>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
