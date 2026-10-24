"use client";

import { Download, Plus, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatDay } from "@/lib/format";
import { archiveDocumentAction, documentLinkAction, requestSignatureAction, uploadDocumentAction } from "@/server/modules/growth/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { Menu } from "@/ui/menu";
import { humanize, StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { useAction } from "@/ui/use-action";

const CATEGORIES = ["CARRIER_AGREEMENT", "CLIENT_CONTRACT", "NDA", "OFFER_LETTER", "STAFF_CONTRACT", "CAC", "COMPLIANCE", "TENDER", "POLICY", "OTHER"];
type Row = { id: string; title: string; category: string; status: string; linkedTo: { label: string; href: string | null } | null; expiresOn: string | null; daysLeft: number | null; hasFile: boolean; signatures: { signed: number; total: number }; restricted: boolean };
type Opt = { id: string; name: string };

export function VaultTable({ rows, units, carriers, canUpload, canEdit }: { rows: Row[]; units: Opt[]; carriers: Opt[]; canUpload: boolean; canEdit: boolean }) {
  const [upload, setUpload] = useState(false);
  const [signing, setSigning] = useState<Row | null>(null);
  const up = useAction(uploadDocumentAction, { success: "Document stored", onSuccess: () => setUpload(false) });
  const link = useAction(documentLinkAction, { refresh: false, onSuccess: (r) => window.open(r.url, "_blank", "noopener") });
  const archive = useAction(archiveDocumentAction, { success: "Archived" });
  const sign = useAction(requestSignatureAction, { success: "Signing link emailed", onSuccess: () => setSigning(null) });
  return (
    <>
      {canUpload && <div className="flex justify-end"><Button variant="primary" onClick={() => setUpload(true)}><Plus className="size-3.5" /> Upload document</Button></div>}
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Document</Th><Th>Linked to</Th><Th>Expires</Th><Th>Signatures</Th><Th>Status</Th><Th /></tr></THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={6}>No documents.</TableEmpty>}
            {rows.map((d) => (
              <Tr key={d.id}>
                <Td>
                  <p className="font-medium">{d.title}{d.restricted && <Badge className="ml-1.5">Restricted</Badge>}</p>
                  <p className="text-2xs text-ink-3">{humanize(d.category)}</p>
                </Td>
                <Td muted>{d.linkedTo ? (d.linkedTo.href ? <Link href={d.linkedTo.href} className="hover:text-accent">{d.linkedTo.label}</Link> : d.linkedTo.label) : "—"}</Td>
                <Td className={cn("whitespace-nowrap", d.daysLeft != null && d.daysLeft <= 30 ? "font-medium text-warning" : "text-ink-3", d.daysLeft != null && d.daysLeft < 0 && "text-danger")}>{d.expiresOn ? <>{formatDay(d.expiresOn)}<span className="ml-1.5 text-2xs">{d.daysLeft! < 0 ? "expired" : `${d.daysLeft}d`}</span></> : "—"}</Td>
                <Td muted>{d.signatures.total ? `${d.signatures.signed}/${d.signatures.total}` : "—"}</Td>
                <Td><StatusBadge status={d.status} /></Td>
                <Td align="right" className="whitespace-nowrap">
                  {d.hasFile && <Button size="sm" variant="ghost" onClick={() => link.run(d.id)} aria-label="Open"><Download className="size-3.5" /></Button>}
                  {canEdit && <Menu items={[{ label: "Request counterparty signature", icon: <Send className="size-3.5" />, onSelect: () => setSigning(d) }, { label: "Archive", danger: true, onSelect: () => archive.run(d.id) }]} />}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Dialog open={upload} onOpenChange={setUpload}>
        <DialogContent title="Upload to the vault" description="PDFs and images up to 20 MB, virus-scanned and stored with a SHA-256 fingerprint." footer={<><Button variant="ghost" onClick={() => setUpload(false)}>Cancel</Button><Button variant="primary" type="submit" form="vault" loading={up.pending}>Upload</Button></>}>
          <form id="vault" className="grid gap-4" action={up.formAction((f) => f)}>
            <Field label="Title" htmlFor="v-title" error={up.errors.title}><Input id="v-title" name="title" required autoFocus placeholder="e.g. MTN interconnect agreement 2026" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Category" htmlFor="v-cat"><Select id="v-cat" name="category">{CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}</Select></Field>
              <Field label="Unit" htmlFor="v-unit"><Select id="v-unit" name="unitId" defaultValue=""><option value="">Company-wide</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
              <Field label="Effective" htmlFor="v-eff"><Input id="v-eff" name="effectiveOn" type="date" /></Field>
              <Field label="Expires" htmlFor="v-exp" hint="Renewal alerts start 30 days before"><Input id="v-exp" name="expiresOn" type="date" /></Field>
            </div>
            {carriers.length > 0 && <Field label="Carrier (optional)" htmlFor="v-car"><Select id="v-car" name="carrierId" defaultValue=""><option value="">—</option>{carriers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
            <fieldset className="grid gap-1.5 text-[13px]">
              <legend className="mb-1 text-[12.5px] font-medium text-ink-2">Restrict to (blank = everyone with vault access)</legend>
              <div className="flex flex-wrap gap-4">{["admin", "finance", "hr", "ops_manager"].map((r) => <label key={r} className="flex items-center gap-1.5"><input type="checkbox" name="restrictedTo" value={r} className="accent-[hsl(var(--accent))]" /> {humanize(r.toUpperCase())}</label>)}</div>
            </fieldset>
            <Field label="File" htmlFor="v-file"><Input id="v-file" name="file" type="file" accept="application/pdf,image/png,image/jpeg" required /></Field>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!signing} onOpenChange={(o) => !o && setSigning(null)}>
        {signing && (
          <DialogContent title={`Request signature: ${signing.title}`} description="We email a personal link that expires in 14 days. They sign by typing their name; the time, IP and device are recorded." footer={<><Button variant="ghost" onClick={() => setSigning(null)}>Cancel</Button><Button variant="primary" type="submit" form="sig" loading={sign.pending}>Send link</Button></>}>
            <form id="sig" className="grid gap-4" action={sign.formAction((f) => ({ documentId: signing.id, name: f.get("name"), email: f.get("email") }))}>
              <Field label="Signer's full name" htmlFor="sg-n"><Input id="sg-n" name="name" required /></Field>
              <Field label="Email" htmlFor="sg-e" error={sign.errors.email}><Input id="sg-e" name="email" type="email" required /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
