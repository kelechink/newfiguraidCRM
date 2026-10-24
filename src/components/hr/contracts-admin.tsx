"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { MERGE_FIELDS } from "@/domain/hr/merge";
import { localDate } from "@/domain/sop/schedule";
import { formatDay, money } from "@/lib/format";
import { approveTemplateAction, savePolicyAction, saveTemplateAction } from "@/server/modules/hr/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { Markdown } from "@/ui/markdown";
import { humanize, StatusBadge } from "@/ui/status";
import { useAction } from "@/ui/use-action";

const KINDS = ["EMPLOYMENT", "OFFER_LETTER", "NDA", "IP_ASSIGNMENT", "NON_SOLICITATION", "ATTENDANCE_POLICY", "CODE_OF_CONDUCT", "DATA_PROTECTION", "PROPERTY_RETURN", "ADDENDUM", "RESIGNATION_ACCEPTANCE", "TERMINATION_LETTER"];
type Template = { id: string; kind: string; version: number; title: string; body: string; status: string; inPack: boolean; lawyerName: string | null; lawyerReviewedAt: string | null; createdAt: string };

export function TemplatesAdmin({ templates, canEdit }: { templates: Template[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [viewing, setViewing] = useState<Template | null>(null);
  const [approving, setApproving] = useState<Template | null>(null);
  const save = useAction(saveTemplateAction, { success: "Saved as a new draft version", onSuccess: () => setEditing(null) });
  const approve = useAction(approveTemplateAction, { success: "Approved — new packs use this version", onSuccess: () => setApproving(null) });
  const byKind = KINDS.map((k) => ({ kind: k, versions: templates.filter((t) => t.kind === k) })).filter((g) => g.versions.length || canEdit);
  return (
    <Card padded={false}>
      <CardHeader title="Contract templates" description="Markdown with merge fields. Editing always creates a new version; signed contracts keep the exact text that was signed." className="px-4 pt-3" actions={canEdit && <Button size="sm" variant="primary" onClick={() => setEditing({ kind: "EMPLOYMENT", inPack: true })}><Plus className="size-3.5" /> New template</Button>} />
      <ul className="divide-y divide-line">
        {byKind.map((g) => {
          const current = g.versions.find((v) => v.status === "approved");
          const draft = g.versions.find((v) => v.status === "draft");
          return (
            <li key={g.kind} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
              <div>
                <p className="font-medium">{humanize(g.kind)}</p>
                <p className="text-2xs text-ink-3">
                  {current ? `v${current.version} approved${current.lawyerName ? ` · reviewed by ${current.lawyerName}` : " · not lawyer-reviewed"}` : "No approved version"}
                  {current && !current.inPack && " · not in onboarding pack"}
                  {draft && ` · draft v${draft.version} waiting`}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {current && <Button size="sm" variant="ghost" onClick={() => setViewing(current)}>View</Button>}
                {canEdit && draft && <Button size="sm" variant="secondary" onClick={() => setApproving(draft)}>Review draft</Button>}
                {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(draft ?? current ?? { kind: g.kind, inPack: true })}>{current || draft ? "New version" : "Write"}</Button>}
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title="Template" className="max-w-[760px]" footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" type="submit" form="tpl" loading={save.pending}>Save draft</Button></>}>
            <form id="tpl" className="grid gap-4" action={save.formAction((f) => ({ kind: f.get("kind"), title: f.get("title"), body: f.get("body"), inPack: f.get("inPack") === "on" }))}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Kind" htmlFor="tp-kind"><Select id="tp-kind" name="kind" defaultValue={editing.kind}>{KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}</Select></Field>
                <Field label="Title" htmlFor="tp-title" error={save.errors.title}><Input id="tp-title" name="title" defaultValue={editing.title} required /></Field>
              </div>
              <Field label="Body" htmlFor="tp-body" error={save.errors.body}><Textarea id="tp-body" name="body" rows={16} defaultValue={editing.body} className="font-mono text-[12.5px]" required /></Field>
              <p className="text-2xs text-ink-3">Merge fields: {MERGE_FIELDS.map((m) => `{{${m}}}`).join(" ")}. Salary is deliberately not a merge field — it stays encrypted in the staff record.</p>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="inPack" defaultChecked={editing.inPack ?? true} className="accent-[hsl(var(--accent))]" /> Include in the onboarding pack</label>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        {viewing && (
          <DialogContent title={`${viewing.title} · v${viewing.version}`} className="max-w-[760px]">
            <div className="max-h-[60vh] overflow-auto rounded-lg border border-line p-4"><Markdown source={viewing.body} /></div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!approving} onOpenChange={(o) => !o && setApproving(null)}>
        {approving && (
          <DialogContent title={`Approve ${approving.title} v${approving.version}?`} className="max-w-[760px]" description="Have a Nigerian employment lawyer review templates before first use. The current approved version retires; already-signed contracts are unaffected." footer={<><Button variant="ghost" onClick={() => setApproving(null)}>Cancel</Button><Button variant="primary" type="submit" form="appr" loading={approve.pending}>Approve</Button></>}>
            <div className="mb-4 max-h-[45vh] overflow-auto rounded-lg border border-line p-4"><Markdown source={approving.body} /></div>
            <form id="appr" action={approve.formAction((f) => ({ templateId: approving.id, lawyerName: f.get("lawyer") || undefined }))}>
              <Field label="Reviewed by (lawyer)" htmlFor="ap-law" hint="Leave blank if not yet reviewed — it will show as unreviewed."><Input id="ap-law" name="lawyer" /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}

type Policy = { id: string; name: string; unit: string; latenessMode: string; fixedAmount: number | null; tiers: { fromMinutes: number; toMinutes: number | null; amount: number }[]; absenceMode: string; absenceAmount: number | null; monthlyCapAmount: number | null; monthlyCapPct: number | null; effectiveFrom: string; pinnedStaff: number };

export function PoliciesAdmin({ policies, units, canEdit }: { policies: Policy[]; units: { id: string; name: string }[]; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("TIERED");
  const [absence, setAbsence] = useState("DAILY_RATE");
  const [tiers, setTiers] = useState([{ fromMinutes: "1", toMinutes: "15", amount: "500" }, { fromMinutes: "16", toMinutes: "30", amount: "1000" }, { fromMinutes: "31", toMinutes: "", amount: "2000" }]);
  const save = useAction(savePolicyAction, { success: "Policy saved", onSuccess: () => setOpen(false) });
  return (
    <Card padded={false}>
      <CardHeader title="Lateness & absence policies" description="Applied automatically by payroll. Saving adds a new version from its effective date." className="px-4 pt-3" actions={canEdit && <Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus className="size-3.5" /> New version</Button>} />
      <ul className="divide-y divide-line">
        {policies.length === 0 && <li className="px-4 py-3 text-[13px] text-ink-3">No policy yet — nobody is charged for lateness until you add one.</li>}
        {policies.map((p) => (
          <li key={p.id} className="grid gap-1 px-4 py-3 text-[13px]">
            <p className="flex flex-wrap items-center gap-2 font-medium">{p.name} <Badge>{p.unit}</Badge><span className="text-2xs font-normal text-ink-3">from {formatDay(p.effectiveFrom)}{p.pinnedStaff ? ` · pinned to ${p.pinnedStaff}` : ""}</span></p>
            <p className="text-[12.5px] text-ink-2">
              {p.latenessMode === "FIXED" ? `${money(p.fixedAmount ?? 0)} per late day` : p.tiers.map((t) => `${t.fromMinutes}${t.toMinutes ? `–${t.toMinutes}` : "+"} min ${money(t.amount)}`).join(" · ")}
              {" · "}absence {p.absenceMode === "DAILY_RATE" ? "a day's pay" : money(p.absenceAmount ?? 0)}
              {(p.monthlyCapAmount != null || p.monthlyCapPct != null) && ` · cap ${[p.monthlyCapAmount != null ? money(p.monthlyCapAmount) : null, p.monthlyCapPct != null ? `${p.monthlyCapPct}% of gross` : null].filter(Boolean).join(" or ")}`}
            </p>
          </li>
        ))}
      </ul>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Lateness & absence policy" className="max-w-[620px]" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="pol" loading={save.pending}>Save</Button></>}>
          <form
            id="pol"
            className="grid gap-4"
            action={save.formAction((f) => ({
              name: f.get("name"),
              unitId: f.get("unit") || null,
              latenessMode: mode,
              fixedAmount: mode === "FIXED" ? f.get("fixed") : null,
              tiers: mode === "TIERED" ? tiers.filter((t) => t.fromMinutes && t.amount).map((t) => ({ fromMinutes: t.fromMinutes, toMinutes: t.toMinutes || null, amount: t.amount })) : [],
              absenceMode: absence,
              absenceAmount: absence === "FIXED" ? f.get("absAmt") : null,
              monthlyCapAmount: f.get("capAmt") || null,
              monthlyCapPct: f.get("capPct") || null,
              effectiveFrom: f.get("from"),
              documentVersion: f.get("doc") || undefined,
            }))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="po-name"><Input id="po-name" name="name" required defaultValue="Standard lateness policy" /></Field>
              <Field label="Applies to" htmlFor="po-unit"><Select id="po-unit" name="unit" defaultValue=""><option value="">All units</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
              <Field label="Lateness" htmlFor="po-mode"><Select id="po-mode" value={mode} onChange={(e) => setMode(e.target.value)}><option value="TIERED">Tiered by minutes late</option><option value="FIXED">Flat amount per late day</option></Select></Field>
              {mode === "FIXED" ? <Field label="Per late day (₦)" htmlFor="po-fixed"><Input id="po-fixed" name="fixed" type="number" min={0} required /></Field> : <span />}
            </div>
            {mode === "TIERED" && (
              <div className="grid gap-2">
                {tiers.map((t, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_1fr_32px] items-center gap-2 text-[12.5px]">
                    <Input aria-label="From minutes" type="number" min={1} value={t.fromMinutes} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, fromMinutes: e.target.value } : x)))} placeholder="From min" />
                    <Input aria-label="To minutes" type="number" min={1} value={t.toMinutes} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, toMinutes: e.target.value } : x)))} placeholder="To min (blank = no limit)" />
                    <Input aria-label="Amount" type="number" min={0} value={t.amount} onChange={(e) => setTiers((ts) => ts.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} placeholder="₦" />
                    <button type="button" aria-label="Remove tier" onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-danger"><Trash2 className="size-3.5" /></button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => setTiers((ts) => [...ts, { fromMinutes: "", toMinutes: "", amount: "" }])}><Plus className="size-3.5" /> Add tier</Button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Unexcused absence" htmlFor="po-abs"><Select id="po-abs" value={absence} onChange={(e) => setAbsence(e.target.value)}><option value="DAILY_RATE">A day's pay (gross ÷ working days)</option><option value="FIXED">Fixed amount</option></Select></Field>
              {absence === "FIXED" ? <Field label="Per absence (₦)" htmlFor="po-absamt"><Input id="po-absamt" name="absAmt" type="number" min={0} required /></Field> : <span />}
              <Field label="Monthly cap (₦)" htmlFor="po-cap" hint="Optional"><Input id="po-cap" name="capAmt" type="number" min={0} /></Field>
              <Field label="Monthly cap (% of gross)" htmlFor="po-capp" hint="The lower cap wins"><Input id="po-capp" name="capPct" type="number" min={0} max={100} step="0.1" /></Field>
              <Field label="Effective from" htmlFor="po-from"><Input id="po-from" name="from" type="date" defaultValue={localDate(new Date()).slice(0, 8) + "01"} required /></Field>
              <Field label="Signed policy version" htmlFor="po-doc" hint="Links to the attendance policy staff signed"><Input id="po-doc" name="doc" placeholder="e.g. ATTENDANCE_POLICY v2" /></Field>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
