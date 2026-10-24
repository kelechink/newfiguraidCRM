"use client";

import { Merge, Pencil, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { logActivityAction, mergeContactsAction, updateContactAction } from "@/server/modules/crm/actions";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { ConfirmButton } from "@/ui/confirm";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { useAction } from "@/ui/use-action";

const TYPES: [string, string][] = [["NOTE", "📝 Note"], ["CALL", "📞 Call"], ["MEETING", "🤝 Meeting"], ["EMAIL_SENT", "✉️ Email"], ["SMS", "📱 SMS"]];

export function ActivityComposer({ contactId }: { contactId: string }) {
  const [type, setType] = useState("NOTE");
  const [text, setText] = useState("");
  const log = useAction(logActivityAction, { success: "Logged", onSuccess: () => setText("") });
  return (
    <form className="rounded-lg border border-line bg-surface-2/40 p-2" action={log.formAction(() => ({ contactId, type, summary: text }))}>
      <div className="mb-1.5 flex flex-wrap gap-1">
        {TYPES.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setType(k)} className={cn("h-6 rounded-md px-2 text-2xs font-medium", type === k ? "bg-surface text-ink shadow-card ring-1 ring-line" : "text-ink-3 hover:text-ink-2")}>{l}</button>
        ))}
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={type === "CALL" ? "What was discussed? Next step?" : "Write a note…"} className="min-h-[60px] border-0 bg-transparent shadow-none focus:ring-0" aria-label="Activity" />
      <div className="flex justify-end"><Button size="sm" variant="primary" type="submit" disabled={text.trim().length < 2} loading={log.pending}>Log</Button></div>
    </form>
  );
}

export function ContactActions({ contact, owners }: { contact: { id: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; ownerId: string | null; lifecycle: string; company: string | null; budget: number | null }; owners: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const save = useAction(updateContactAction, { success: "Saved", onSuccess: () => setOpen(false) });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}><Pencil className="size-3.5" /> Edit</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Edit contact" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="edit-contact" loading={save.pending}>Save</Button></>}>
          <form
            id="edit-contact"
            className="grid gap-4"
            action={save.formAction((f) => ({
              id: contact.id,
              firstName: String(f.get("first") ?? ""),
              lastName: String(f.get("last") ?? ""),
              email: String(f.get("email") ?? ""),
              phone: String(f.get("phone") ?? ""),
              companyName: String(f.get("company") ?? "") || undefined,
              ownerId: f.get("owner") || null,
              lifecycle: f.get("lifecycle"),
              budget: f.get("budget") ? Number(f.get("budget")) : null,
            }))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" htmlFor="e-first"><Input id="e-first" name="first" defaultValue={contact.firstName ?? ""} /></Field>
              <Field label="Last name" htmlFor="e-last"><Input id="e-last" name="last" defaultValue={contact.lastName ?? ""} /></Field>
              <Field label="Email" htmlFor="e-email"><Input id="e-email" name="email" type="email" defaultValue={contact.email ?? ""} /></Field>
              <Field label="Phone" htmlFor="e-phone"><Input id="e-phone" name="phone" defaultValue={contact.phone ?? ""} /></Field>
              <Field label="Company" htmlFor="e-co"><Input id="e-co" name="company" defaultValue={contact.company ?? ""} /></Field>
              <Field label="Budget (₦)" htmlFor="e-budget"><Input id="e-budget" name="budget" type="number" min={0} defaultValue={contact.budget ?? ""} /></Field>
              <Field label="Stage" htmlFor="e-life">
                <Select id="e-life" name="lifecycle" defaultValue={contact.lifecycle}>{["LEAD", "QUALIFIED", "CUSTOMER", "CHURNED", "ARCHIVED"].map((l) => <option key={l} value={l}>{l[0] + l.slice(1).toLowerCase()}</option>)}</Select>
              </Field>
              <Field label="Owner" htmlFor="e-owner">
                <Select id="e-owner" name="owner" defaultValue={contact.ownerId ?? ""}><option value="">Unassigned</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
              </Field>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DuplicateBanner({ survivorId, duplicates }: { survivorId: string; duplicates: { id: string; name: string; reason: string | null }[] }) {
  const merge = useAction(mergeContactsAction, { success: "Merged — everything is now on this contact" });
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-[13px]">
      <TriangleAlert className="size-4 text-warning" />
      <span className="flex-1">Possible duplicate{duplicates.length > 1 ? "s" : ""}:</span>
      {duplicates.map((d) => (
        <span key={d.id} className="flex items-center gap-2">
          <Link href={`/customers/contacts/${d.id}`} className="font-medium underline">{d.name}</Link>
          <span className="text-2xs text-ink-3">same {d.reason}</span>
          <ConfirmButton
            title={`Merge ${d.name} into this contact?`}
            body="Their deals, messages, invoices, tickets and history move here, missing details are filled in, and the duplicate is retired. This is recorded in the audit log."
            confirmLabel="Merge"
            onConfirm={() => merge.run({ survivorId, duplicateId: d.id })}
          >
            <Button size="sm" variant="secondary"><Merge className="size-3.5" /> Merge</Button>
          </ConfirmButton>
        </span>
      ))}
    </div>
  );
}
