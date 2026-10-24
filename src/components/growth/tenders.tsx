"use client";

import { Check, Plus, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDay, money } from "@/lib/format";
import { checklistItemAction, moveTenderAction, saveTenderAction } from "@/server/modules/growth/actions";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent, SheetContent } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { humanize } from "@/ui/status";
import { useAction } from "@/ui/use-action";

const STAGES = ["IDENTIFIED", "CONTACT_MADE", "PROPOSAL_DRAFTED", "SUBMITTED", "PRESENTATION", "AWARDED", "LOST"] as const;
type T = { id: string; title: string; agency: string; state: string; reference: string | null; deadline: string; daysLeft: number; value: number | null; currency: string; stage: string; owner: { id: string; name: string }; unit: string; ready: number; required: number };
type Detail = { id: string; title: string; agency: string; stage: string; outcomeNote: string | null; checklist: { id: string; label: string; required: boolean; hasFile: boolean; doneAt: string | null }[] };

export function TenderBoard({ tenders, detail, units, canEdit }: { tenders: T[]; detail: Detail | null; units: { id: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [outcome, setOutcome] = useState<{ id: string; stage: string } | null>(null);
  const save = useAction(saveTenderAction, { success: "Tender added", onSuccess: (r) => { setCreating(false); router.push(`/customers/tenders?t=${r.id}`); } });
  const move = useAction(moveTenderAction, { success: "Stage updated", onSuccess: () => setOutcome(null) });
  const item = useAction(checklistItemAction);
  const go = (id: string, stage: string) => (stage === "AWARDED" || stage === "LOST" ? setOutcome({ id, stage }) : move.run({ tenderId: id, stage }));
  return (
    <>
      {canEdit && <div className="flex justify-end"><Button variant="primary" onClick={() => setCreating(true)}><Plus className="size-3.5" /> Add tender</Button></div>}
      <div className="scrollbar-thin -mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
        {STAGES.map((stage) => {
          const items = tenders.filter((t) => t.stage === stage);
          return (
            <section key={stage} className="w-[264px] shrink-0">
              <h2 className="mb-2 flex items-center justify-between px-1 text-[12.5px] font-semibold text-ink-2">{humanize(stage)}<span className="text-ink-3">{items.length}</span></h2>
              <div className="grid gap-2">
                {items.map((t) => (
                  <button key={t.id} type="button" onClick={() => router.push(`/customers/tenders?t=${t.id}`)} className="rounded-lg border border-line bg-surface p-3 text-left shadow-card hover:border-line-strong">
                    <p className="text-[13px] font-medium leading-snug">{t.title}</p>
                    <p className="mt-0.5 text-2xs text-ink-3">{t.agency} · {t.state}</p>
                    <div className="mt-2 flex items-center justify-between text-2xs">
                      <span className={cn(t.daysLeft < 0 ? "text-ink-3" : t.daysLeft <= 7 ? "font-medium text-danger" : t.daysLeft <= 14 ? "font-medium text-warning" : "text-ink-3")}>{t.daysLeft < 0 ? `Closed ${formatDay(t.deadline)}` : `${t.daysLeft}d · ${formatDay(t.deadline)}`}</span>
                      <span className={cn("tabular", t.ready < t.required ? "text-ink-3" : "text-success")}>{t.ready}/{t.required} docs</span>
                    </div>
                    {t.value != null && <p className="mt-1 text-2xs font-medium tabular">{money(t.value, t.currency, { compact: true })}</p>}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && router.push("/customers/tenders")}>
        {detail && (
          <SheetContent title={detail.title}>
            <p className="text-[13px] text-ink-3">{detail.agency}</p>
            {canEdit && (
              <Field label="Stage" htmlFor="td-st">
                <Select id="td-st" value={detail.stage} onChange={(e) => go(detail.id, e.target.value)}>{STAGES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select>
              </Field>
            )}
            {detail.outcomeNote && <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-[13px]">{detail.outcomeNote}</p>}
            <h3 className="mb-2 mt-5 text-[12.5px] font-semibold text-ink-2">Submission checklist</h3>
            <ul className="grid gap-1">
              {detail.checklist.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-[13px] hover:bg-surface-2">
                  <button type="button" disabled={!canEdit} onClick={() => { const f = new FormData(); f.set("tenderId", detail.id); f.set("itemId", c.id); f.set("done", c.doneAt ? "false" : "true"); item.run(f); }} className={cn("grid size-4 shrink-0 place-items-center rounded border", c.doneAt ? "border-success bg-success text-white" : "border-line-strong")} aria-label={c.doneAt ? `Mark ${c.label} not done` : `Mark ${c.label} done`}>{c.doneAt && <Check className="size-3" />}</button>
                  <span className={cn("flex-1", c.doneAt && "text-ink-3")}>{c.label}{!c.required && <span className="ml-1 text-2xs text-ink-3">(optional)</span>}</span>
                  {c.hasFile && <span className="text-2xs text-ink-3">file</span>}
                  {canEdit && (
                    <label className="cursor-pointer rounded p-1 text-ink-3 hover:text-ink" title="Attach file">
                      <Upload className="size-3.5" />
                      <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const f = new FormData(); f.set("tenderId", detail.id); f.set("itemId", c.id); f.set("file", file); item.run(f); }} />
                    </label>
                  )}
                </li>
              ))}
            </ul>
            {canEdit && (
              <form className="mt-3 flex gap-2" action={item.formAction((f) => { f.set("tenderId", detail.id); return f; })}>
                <Input name="label" placeholder="Add a requirement" className="h-8" required />
                <Button type="submit" size="sm" variant="secondary">Add</Button>
              </form>
            )}
          </SheetContent>
        )}
      </Dialog>

      <Dialog open={!!outcome} onOpenChange={(o) => !o && setOutcome(null)}>
        {outcome && (
          <DialogContent title={outcome.stage === "AWARDED" ? "Tender awarded" : "Tender lost"} footer={<><Button variant="ghost" onClick={() => setOutcome(null)}>Cancel</Button><Button variant="primary" type="submit" form="outc" loading={move.pending}>Save</Button></>}>
            <form id="outc" action={move.formAction((f) => ({ tenderId: outcome.id, stage: outcome.stage, outcomeNote: f.get("note") }))}>
              <Field label={outcome.stage === "AWARDED" ? "Award details" : "Why we lost"} htmlFor="oc-n"><Textarea id="oc-n" name="note" rows={3} required /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="Add a tender" description="A standard Nigerian procurement checklist is added; adjust it per tender." footer={<><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" type="submit" form="tnd" loading={save.pending}>Save</Button></>}>
          <form id="tnd" className="grid gap-4" action={save.formAction((f) => ({ unitId: f.get("unit"), title: f.get("title"), agency: f.get("agency"), state: f.get("state"), reference: f.get("ref") || undefined, deadline: `${f.get("deadline")}T12:00:00+01:00`, estimatedValue: f.get("value") || null, currency: f.get("currency") }))}>
            <Field label="Title" htmlFor="tn-t" error={save.errors.title}><Input id="tn-t" name="title" required autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ministry / agency" htmlFor="tn-a"><Input id="tn-a" name="agency" required /></Field>
              <Field label="State" htmlFor="tn-s"><Input id="tn-s" name="state" defaultValue="Akwa Ibom" /></Field>
              <Field label="Deadline" htmlFor="tn-d"><Input id="tn-d" name="deadline" type="date" required /></Field>
              <Field label="Reference" htmlFor="tn-r"><Input id="tn-r" name="ref" /></Field>
              <Field label="Estimated value" htmlFor="tn-v"><Input id="tn-v" name="value" type="number" min={0} /></Field>
              <Field label="Currency" htmlFor="tn-c"><Select id="tn-c" name="currency" defaultValue="NGN">{["NGN", "USD", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
            </div>
            <Field label="Unit" htmlFor="tn-u"><Select id="tn-u" name="unit">{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
