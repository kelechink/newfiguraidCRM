"use client";

import { Download, Plus } from "lucide-react";
import { useState } from "react";
import { formatDay, formatDateTime } from "@/lib/format";
import { dsrMatchesAction, eraseDsrAction, exportDsrAction, publishPolicyDocAction, savePolicyDocAction, updateDsrAction } from "@/server/modules/growth/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { cn } from "@/ui/cn";
import { ConfirmButton } from "@/ui/confirm";
import { Dialog, DialogContent, SheetContent } from "@/ui/dialog";
import { downloadText } from "@/ui/download";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { Markdown } from "@/ui/markdown";
import { humanize, StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { useAction } from "@/ui/use-action";

type Dsr = { id: string; reference: string; type: string; status: string; name: string; email: string | null; phone: string | null; details: string | null; contact: { id: string; displayName: string } | null; assignee: string | null; receivedAt: string; dueAt: string; daysLeft: number; verified: boolean; resolution: string | null };

export function DsrQueue({ rows, canEdit }: { rows: Dsr[]; canEdit: boolean }) {
  const [open, setOpen] = useState<Dsr | null>(null);
  const [matches, setMatches] = useState<{ id: string; name: string; email: string | null; phone: string | null; unit: string }[] | null>(null);
  const update = useAction(updateDsrAction, { success: "Updated" });
  const find = useAction(dsrMatchesAction, { refresh: false, onSuccess: setMatches });
  const exp = useAction(exportDsrAction, { refresh: false, onSuccess: (r) => downloadText(r.filename, r.json, "application/json") });
  const erase = useAction(eraseDsrAction, { success: "Personal data erased", onSuccess: () => setOpen(null) });
  const current = open ? rows.find((r) => r.id === open.id) ?? open : null;
  return (
    <Card padded={false}>
      <CardHeader title="Data subject requests" description="Access, correction, deletion and objection requests under the NDPA 2023. Verify identity before acting." className="px-4 pt-3" />
      <Table>
        <THead><tr><Th>Request</Th><Th>From</Th><Th>Due</Th><Th>Identity</Th><Th>Status</Th></tr></THead>
        <tbody>
          {rows.length === 0 && <TableEmpty colSpan={5}>No requests.</TableEmpty>}
          {rows.map((r) => {
            const closed = ["COMPLETED", "REJECTED"].includes(r.status);
            return (
              <Tr key={r.id}>
                <Td><button type="button" onClick={() => { setMatches(null); setOpen(r); }} className="text-left font-medium hover:text-accent">{humanize(r.type)}</button><p className="font-mono text-2xs text-ink-3">{r.reference}</p></Td>
                <Td><p>{r.name}</p><p className="text-2xs text-ink-3">{r.email ?? r.phone}</p></Td>
                <Td className={cn("whitespace-nowrap", !closed && r.daysLeft <= 5 ? "font-medium text-danger" : "text-ink-3")}>{closed ? "—" : r.daysLeft < 0 ? `${-r.daysLeft}d overdue` : `${r.daysLeft}d · ${formatDay(r.dueAt)}`}</Td>
                <Td>{r.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Not verified</Badge>}</Td>
                <Td><StatusBadge status={r.status === "RECEIVED" ? "NEW" : r.status === "IN_PROGRESS" ? "IN_PROGRESS" : r.status} label={humanize(r.status)} /></Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <Dialog open={!!current} onOpenChange={(o) => !o && setOpen(null)}>
        {current && (
          <SheetContent title={`${humanize(current.type)} · ${current.reference}`}>
            <dl className="grid gap-1.5 text-[13px]">
              <div className="flex justify-between gap-3"><dt className="text-ink-3">Requester</dt><dd>{current.name}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-3">Contact</dt><dd>{[current.email, current.phone].filter(Boolean).join(" · ")}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-3">Received</dt><dd>{formatDateTime(current.receivedAt)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-3">Due</dt><dd>{formatDay(current.dueAt)}</dd></div>
            </dl>
            {current.details && <p className="mt-3 whitespace-pre-wrap rounded-md bg-surface-2 px-3 py-2 text-[13px]">{current.details}</p>}
            {canEdit && !["COMPLETED", "REJECTED"].includes(current.status) && (
              <div className="mt-5 grid gap-4">
                <section>
                  <h3 className="text-[12.5px] font-semibold">1. Verify identity</h3>
                  <p className="mt-1 text-[12.5px] text-ink-3">Confirm through a channel already on record (reply from the same email or a call to the same number). Never share data before this.</p>
                  {current.verified ? <p className="mt-2 text-[13px] text-success">Identity verified.</p> : <Button size="sm" variant="secondary" className="mt-2" onClick={() => update.run({ dsrId: current.id, verified: true, status: "IN_PROGRESS" })}>Mark identity verified</Button>}
                </section>
                {current.verified && (
                  <section>
                    <h3 className="text-[12.5px] font-semibold">2. Find their records</h3>
                    {current.contact ? <p className="mt-1 text-[13px]">Linked to <span className="font-medium">{current.contact.displayName}</span></p> : <Button size="sm" variant="secondary" className="mt-2" onClick={() => find.run(current.id)} loading={find.pending}>Search contacts</Button>}
                    {!current.contact && matches && (
                      <ul className="mt-2 grid gap-1">
                        {matches.length === 0 && <li className="text-[13px] text-ink-3">No matching contact — record that we hold no data.</li>}
                        {matches.map((m) => <li key={m.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-2.5 py-1.5 text-[13px]"><span>{m.name}<span className="block text-2xs text-ink-3">{m.unit} · {m.email ?? m.phone}</span></span><Button size="sm" variant="ghost" onClick={() => update.run({ dsrId: current.id, contactId: m.id })}>Link</Button></li>)}
                      </ul>
                    )}
                  </section>
                )}
                {current.verified && current.contact && (
                  <section className="grid gap-2">
                    <h3 className="text-[12.5px] font-semibold">3. Act</h3>
                    <Button size="sm" variant="secondary" className="w-fit" onClick={() => exp.run(current.id)} loading={exp.pending}><Download className="size-3.5" /> Export their data (JSON)</Button>
                    {current.type === "DELETION" && (
                      <ConfirmButton title="Erase this person's data?" body="Removes their name, contact details, messages, form answers and consents. Invoices and payments are kept without personal details, as tax law requires. This can't be undone." confirmLabel="Erase" danger onConfirm={() => erase.run(current.id)}>
                        <Button size="sm" variant="danger" className="w-fit">Erase personal data</Button>
                      </ConfirmButton>
                    )}
                  </section>
                )}
                <form className="grid gap-2" action={update.formAction((f) => ({ dsrId: current.id, status: f.get("status"), resolution: f.get("res") || undefined }))}>
                  <h3 className="text-[12.5px] font-semibold">4. Close</h3>
                  <Textarea aria-label="Resolution" name="res" rows={3} defaultValue={current.resolution ?? ""} placeholder="What was done and how the person was told" />
                  <div className="flex gap-2">
                    <Select aria-label="Outcome" name="status" defaultValue="COMPLETED" className="h-8 w-[160px]"><option value="COMPLETED">Completed</option><option value="REJECTED">Rejected</option></Select>
                    <Button type="submit" size="sm" variant="primary" loading={update.pending}>Close request</Button>
                  </div>
                </form>
              </div>
            )}
            {current.resolution && ["COMPLETED", "REJECTED"].includes(current.status) && <p className="mt-4 text-[13px]"><span className="text-ink-3">Resolution:</span> {current.resolution}</p>}
          </SheetContent>
        )}
      </Dialog>
    </Card>
  );
}

type Policy = { id: string; kind: string; version: string; title: string; body: string; publishedAt: string | null; lawyerReviewedAt: string | null; acceptances: number };
const KINDS = ["PUBLIC_PRIVACY", "STAFF_PRIVACY", "FORM_NOTICE", "WEBCHAT_NOTICE", "WHATSAPP_NOTICE", "ACCEPTABLE_USE"];

export function PolicyAdmin({ policies, canEdit }: { policies: Policy[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Partial<Policy> | null>(null);
  const [viewing, setViewing] = useState<Policy | null>(null);
  const save = useAction(savePolicyDocAction, { success: "Saved", onSuccess: () => setEditing(null) });
  const publish = useAction(publishPolicyDocAction, { success: "Published" });
  const current = (k: string) => policies.find((p) => p.kind === k && p.publishedAt);
  return (
    <Card padded={false}>
      <CardHeader title="Privacy notices" description="Public notice at /privacy, the staff notice everyone accepts at sign-in, and short notices for forms, web chat and WhatsApp." className="px-4 pt-3" actions={canEdit && <Button size="sm" variant="primary" onClick={() => setEditing({ kind: "PUBLIC_PRIVACY" })}><Plus className="size-3.5" /> New version</Button>} />
      <ul className="divide-y divide-line">
        {KINDS.map((k) => {
          const live = current(k);
          const drafts = policies.filter((p) => p.kind === k && !p.publishedAt);
          return (
            <li key={k} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
              <span>
                <span className="font-medium">{humanize(k)}</span>
                <span className="block text-2xs text-ink-3">{live ? `v${live.version} live since ${formatDay(live.publishedAt!)}${k === "STAFF_PRIVACY" ? ` · accepted by ${live.acceptances}` : ""}${live.lawyerReviewedAt ? "" : " · not lawyer-reviewed"}` : "Nothing published"}{drafts.length ? ` · ${drafts.length} draft` : ""}</span>
              </span>
              <span className="flex gap-1.5">
                {live && <Button size="sm" variant="ghost" onClick={() => setViewing(live)}>View</Button>}
                {canEdit && drafts[0] && <ConfirmButton title={`Publish ${humanize(k)} v${drafts[0].version}?`} body={k === "STAFF_PRIVACY" ? "Everyone will be asked to accept it at their next sign-in." : "It replaces the live version immediately."} confirmLabel="Publish" onConfirm={() => publish.run(drafts[0]!.id)}><Button size="sm" variant="secondary">Publish draft</Button></ConfirmButton>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: k, title: live?.title, body: live?.body })}>Edit</Button>}
              </span>
            </li>
          );
        })}
      </ul>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title="Notice" className="max-w-[760px]" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" type="submit" form="pol" loading={save.pending}>Save</Button></>}>
            <form id="pol" className="grid gap-4" action={save.formAction((f) => ({ kind: f.get("kind"), title: f.get("title"), body: f.get("body"), publish: f.get("publish") === "on", lawyerReviewed: f.get("lawyer") === "on" }))}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Notice" htmlFor="pl-k"><Select id="pl-k" name="kind" defaultValue={editing.kind}>{KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</Select></Field>
                <Field label="Title" htmlFor="pl-t"><Input id="pl-t" name="title" defaultValue={editing.title} required /></Field>
              </div>
              <Field label="Text (Markdown)" htmlFor="pl-b" error={save.errors.body}><Textarea id="pl-b" name="body" rows={16} defaultValue={editing.body} className="font-mono text-[12.5px]" required /></Field>
              <div className="flex flex-wrap gap-5 text-[13px]">
                <label className="flex items-center gap-2"><input type="checkbox" name="publish" className="accent-[hsl(var(--accent))]" /> Publish now</label>
                <label className="flex items-center gap-2"><input type="checkbox" name="lawyer" className="accent-[hsl(var(--accent))]" /> Reviewed by a lawyer</label>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        {viewing && <DialogContent title={viewing.title} className="max-w-[760px]"><div className="max-h-[60vh] overflow-auto"><Markdown source={viewing.body} /></div></DialogContent>}
      </Dialog>
    </Card>
  );
}
