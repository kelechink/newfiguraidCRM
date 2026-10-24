"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { addDays, localDate } from "@/domain/sop/schedule";
import { formatDay, money } from "@/lib/format";
import { markSubscriptionUsedAction, saveSubscriptionAction } from "@/server/modules/finance/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { Menu } from "@/ui/menu";
import { humanize, StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { UNIT_STYLE } from "@/ui/units";
import { useAction } from "@/ui/use-action";

type Sub = {
  id: string; name: string; vendor: string; category: string | null; unit: string; unitId: string; owner: { id: string; name: string } | null;
  cost: number; currency: string; recurrence: string; renewalDate: string; daysToRenewal: number; cardLast4: string | null; seats: number | null;
  status: string; lastUsedAt: string | null; monthlyNgn: number; flags: string[]; notes: string | null;
};

export function SubscriptionsTable({ items, units, people, canEdit }: { items: Sub[]; units: { id: string; name: string }[]; people: { id: string; name: string }[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Sub | "new" | null>(null);
  const used = useAction(markSubscriptionUsedAction, { success: "Marked as in use" });
  const cancel = useAction(saveSubscriptionAction, { success: "Subscription cancelled" });
  return (
    <>
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add subscription</Button>
        </div>
      )}
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Tool</Th><Th>Owner</Th><Th>Renews</Th><Th align="right">Cost</Th><Th align="right">Per month (₦)</Th><Th>Status</Th><Th /></tr></THead>
          <tbody>
            {items.length === 0 && <TableEmpty colSpan={7}>No subscriptions recorded yet.</TableEmpty>}
            {items.map((s) => {
              const live = s.status === "ACTIVE" || s.status === "TRIAL";
              return (
                <Tr key={s.id}>
                  <Td>
                    <p className="flex items-center gap-1.5 font-medium"><span className={cn("size-1.5 rounded-full", UNIT_STYLE[s.unit]?.dot)} />{s.name}</p>
                    <p className="text-2xs text-ink-3">{s.vendor}{s.category && ` · ${s.category}`}{s.cardLast4 && ` · card ••${s.cardLast4}`}{s.seats ? ` · ${s.seats} seats` : ""}</p>
                  </Td>
                  <Td muted>{s.owner?.name ?? "—"}</Td>
                  <Td className={cn("whitespace-nowrap", live && s.daysToRenewal <= 7 ? "font-medium text-warning" : "text-ink-3")}>
                    {formatDay(s.renewalDate)}
                    {live && s.daysToRenewal >= 0 && s.daysToRenewal <= 30 && <span className="ml-1.5 text-2xs">in {s.daysToRenewal}d</span>}
                  </Td>
                  <Td align="right">{money(s.cost, s.currency)}<span className="ml-1 text-2xs text-ink-3">/{humanize(s.recurrence).toLowerCase()}</span></Td>
                  <Td align="right" className="font-medium">{live ? money(s.monthlyNgn) : "—"}</Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={s.status} />
                      {s.flags.includes("unused") && <Badge tone="warning">Unused 60d</Badge>}
                      {s.flags.includes("duplicate") && <Badge tone="warning">Possible duplicate</Badge>}
                    </span>
                  </Td>
                  <Td align="right">
                    {canEdit && (
                      <Menu
                        items={[
                          { label: "Edit", onSelect: () => setEditing(s) },
                          { label: "Mark as in use", onSelect: () => used.run(s.id), disabled: !live },
                          { label: "Cancel subscription", danger: true, disabled: !live, onSelect: () => cancel.run({ ...toInput(s), status: "CANCELLED" }) },
                        ]}
                      />
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>
      <SubscriptionDialog sub={editing} onClose={() => setEditing(null)} units={units} people={people} />
    </>
  );
}

function toInput(s: Sub) {
  return { id: s.id, name: s.name, vendor: s.vendor, category: s.category ?? undefined, unitId: s.unitId, ownerId: s.owner?.id ?? null, cost: s.cost, currency: s.currency, recurrence: s.recurrence, renewalDate: s.renewalDate, cardLast4: s.cardLast4 ?? "", seats: s.seats, status: s.status, notes: s.notes ?? undefined };
}

function SubscriptionDialog({ sub, onClose, units, people }: { sub: Sub | "new" | null; onClose: () => void; units: { id: string; name: string }[]; people: { id: string; name: string }[] }) {
  const save = useAction(saveSubscriptionAction, { success: "Saved", onSuccess: onClose });
  const s = sub && sub !== "new" ? sub : null;
  return (
    <Dialog open={!!sub} onOpenChange={(o) => !o && onClose()}>
      {sub && (
        <DialogContent title={s ? `Edit ${s.name}` : "Add subscription"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="sub" loading={save.pending}>Save</Button></>}>
          <form
            id="sub"
            className="grid gap-4"
            action={save.formAction((f) => ({ id: s?.id, name: f.get("name"), vendor: f.get("vendor"), category: f.get("category") || undefined, unitId: f.get("unit"), ownerId: f.get("owner") || null, cost: f.get("cost"), currency: f.get("currency"), recurrence: f.get("recurrence"), renewalDate: f.get("renewal"), cardLast4: f.get("card") || "", seats: f.get("seats") || null, status: f.get("status"), notes: f.get("notes") || undefined }))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tool" htmlFor="s-name" error={save.errors.name}><Input id="s-name" name="name" defaultValue={s?.name} required autoFocus placeholder="e.g. Google Workspace" /></Field>
              <Field label="Vendor" htmlFor="s-vendor" error={save.errors.vendor}><Input id="s-vendor" name="vendor" defaultValue={s?.vendor} required /></Field>
              <Field label="Cost" htmlFor="s-cost" error={save.errors.cost}><Input id="s-cost" name="cost" type="number" step="0.01" min={0} defaultValue={s?.cost} required /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Currency" htmlFor="s-cur"><Select id="s-cur" name="currency" defaultValue={s?.currency ?? "USD"}>{["NGN", "USD", "GBP", "EUR"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
                <Field label="Billed" htmlFor="s-rec"><Select id="s-rec" name="recurrence" defaultValue={s?.recurrence ?? "MONTHLY"}><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUAL">Annually</option></Select></Field>
              </div>
              <Field label="Next renewal" htmlFor="s-ren"><Input id="s-ren" name="renewal" type="date" defaultValue={s?.renewalDate ?? addDays(localDate(new Date()), 30)} required /></Field>
              <Field label="Card (last 4)" htmlFor="s-card" hint="Never the full number." error={save.errors.cardLast4}><Input id="s-card" name="card" inputMode="numeric" maxLength={4} pattern="\d{4}" defaultValue={s?.cardLast4 ?? ""} /></Field>
              <Field label="Unit" htmlFor="s-unit"><Select id="s-unit" name="unit" defaultValue={s?.unitId}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
              <Field label="Owner" htmlFor="s-owner"><Select id="s-owner" name="owner" defaultValue={s?.owner?.id ?? ""}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
              <Field label="Category" htmlFor="s-cat"><Input id="s-cat" name="category" defaultValue={s?.category ?? ""} placeholder="e.g. Email, Design, Hosting" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Seats" htmlFor="s-seats"><Input id="s-seats" name="seats" type="number" min={0} defaultValue={s?.seats ?? ""} /></Field>
                <Field label="Status" htmlFor="s-status"><Select id="s-status" name="status" defaultValue={s?.status ?? "ACTIVE"}><option value="ACTIVE">Active</option><option value="TRIAL">Trial</option><option value="PAUSED">Paused</option><option value="CANCELLED">Cancelled</option></Select></Field>
              </div>
            </div>
            <Field label="Notes" htmlFor="s-notes"><Textarea id="s-notes" name="notes" rows={2} defaultValue={s?.notes ?? ""} /></Field>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
