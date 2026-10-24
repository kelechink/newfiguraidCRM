"use client";

import { Lock, Plus, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { commentTicketAction, createTicketAction, updateTicketAction } from "@/server/modules/growth/actions";
import { formatDateTime } from "@/lib/format";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { humanize } from "@/ui/status";
import { useAction } from "@/ui/use-action";

type Opt = { id: string; name: string };

export function NewTicketButton({ units, contacts, people }: { units: Opt[]; contacts: (Opt & { unitId: string })[]; people: Opt[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const save = useAction(createTicketAction, { success: (r) => `${r.number} created`, onSuccess: (r) => router.push(`/customers/tickets/${r.id}`) });
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-3.5" /> New ticket</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New support ticket" description="Tickets from the inbox are created from the conversation. Use this for calls and walk-ins." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="tkt" loading={save.pending}>Create</Button></>}>
          <form id="tkt" className="grid gap-4" action={save.formAction((f) => ({ unitId: f.get("unit"), contactId: f.get("contact"), subject: f.get("subject"), body: f.get("body"), priority: f.get("priority"), category: f.get("category") || undefined, assigneeId: f.get("assignee") || null, source: "phone" }))}>
            <Field label="Customer" htmlFor="tk-c"><Select id="tk-c" name="contact" required>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Subject" htmlFor="tk-s" error={save.errors.subject}><Input id="tk-s" name="subject" required /></Field>
            <Field label="What's the problem?" htmlFor="tk-b"><Textarea id="tk-b" name="body" rows={4} required /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Priority" htmlFor="tk-p" hint="Urgent: reply in 1 h, fix in 8 h"><Select id="tk-p" name="priority" defaultValue="MEDIUM"><option value="URGENT">Urgent</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></Select></Field>
              <Field label="Category" htmlFor="tk-cat"><Input id="tk-cat" name="category" placeholder="e.g. Email, Hosting, Billing" /></Field>
              <Field label="Unit" htmlFor="tk-u"><Select id="tk-u" name="unit">{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
              <Field label="Assign to" htmlFor="tk-a"><Select id="tk-a" name="assignee" defaultValue=""><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Comment = { id: string; body: string; isPublic: boolean; author: string; fromCustomer: boolean; at: string };

export function TicketThread({ ticketId, comments, canReply, hasEmail }: { ticketId: string; comments: Comment[]; canReply: boolean; hasEmail: boolean }) {
  const [isPublic, setPublic] = useState(hasEmail);
  const [body, setBody] = useState("");
  const send = useAction(commentTicketAction, { success: isPublic ? "Reply sent" : "Note added", onSuccess: () => setBody("") });
  return (
    <div className="grid gap-3">
      <ul className="grid gap-3">
        {comments.map((c) => (
          <li key={c.id} className={cn("rounded-lg border px-4 py-3 text-[13px]", c.isPublic ? "border-line bg-surface" : c.fromCustomer ? "border-accent/20 bg-accent-soft/40" : "border-warning/30 bg-warning/5")}>
            <p className="mb-1 flex items-center gap-2 text-2xs text-ink-3"><span className="font-medium text-ink-2">{c.author}</span>{!c.isPublic && !c.fromCustomer && <span className="inline-flex items-center gap-1"><Lock className="size-3" /> internal</span>}<span>{formatDateTime(c.at)}</span></p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
      {canReply && (
        <form className="grid gap-2 rounded-lg border border-line bg-surface p-3" action={() => void send.run({ ticketId, body, isPublic })}>
          <div className="flex gap-1 text-[12.5px]" role="tablist">
            <button type="button" role="tab" aria-selected={isPublic} disabled={!hasEmail} onClick={() => setPublic(true)} className={cn("rounded-md px-2.5 py-1", isPublic ? "bg-surface-2 font-medium" : "text-ink-3", !hasEmail && "opacity-50")}>Reply to customer</button>
            <button type="button" role="tab" aria-selected={!isPublic} onClick={() => setPublic(false)} className={cn("rounded-md px-2.5 py-1", !isPublic ? "bg-warning/10 font-medium" : "text-ink-3")}>Internal note</button>
          </div>
          <Textarea aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} rows={4} required placeholder={isPublic ? "Emailed to the customer" : "Only your team sees this"} />
          <Button type="submit" variant="primary" size="sm" className="w-fit justify-self-end" loading={send.pending} disabled={!body.trim()}><Send className="size-3.5" /> {isPublic ? "Send reply" : "Add note"}</Button>
        </form>
      )}
    </div>
  );
}

export function TicketControls({ ticket, people, canEdit }: { ticket: { id: string; status: string; priority: string; assigneeId: string | null }; people: Opt[]; canEdit: boolean }) {
  const update = useAction(updateTicketAction, { success: "Updated" });
  if (!canEdit) return null;
  return (
    <div className="grid gap-3">
      <Field label="Status" htmlFor="tc-s"><Select id="tc-s" value={ticket.status} onChange={(e) => update.run({ ticketId: ticket.id, status: e.target.value })}>{["NEW", "OPEN", "PENDING_CUSTOMER", "ON_HOLD", "RESOLVED", "CLOSED"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
      <Field label="Priority" htmlFor="tc-p"><Select id="tc-p" value={ticket.priority} onChange={(e) => update.run({ ticketId: ticket.id, priority: e.target.value })}>{["URGENT", "HIGH", "MEDIUM", "LOW"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
      <Field label="Assignee" htmlFor="tc-a"><Select id="tc-a" value={ticket.assigneeId ?? ""} onChange={(e) => update.run({ ticketId: ticket.id, assigneeId: e.target.value || null })}><option value="">Unassigned</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
      <p className="text-2xs text-ink-3">Resolving emails the customer a one-click satisfaction rating.</p>
    </div>
  );
}
