"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { localDate } from "@/domain/sop/schedule";
import { formatDay, formatDateTime, money, num } from "@/lib/format";
import { invoiceCycleAction, ledgerAction, openDisputeAction, postLedgerAction, updateDisputeAction, vendorStatementAction } from "@/server/modules/telecom/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent, SheetContent } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { Menu, type MenuItem } from "@/ui/menu";
import { humanize, StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { useToast } from "@/ui/toast";
import { useAction } from "@/ui/use-action";

type Acc = {
  id: string; carrier: string; side: string; currency: string; terms: string; paymentMode: string;
  cycle: { start: string; end: string; due: string };
  unbilledEntries: number; unbilledMinutes: number; unbilledAmount: number; unbilledNgn: number; balanceNgn: number | null; exposureNgn: number | null;
  billed: { id: string; number: string | null } | null;
  balance: number | null; lowBalance: boolean; exposure: number | null; creditLimit: number | null; credit: string;
};
type Ledger = { balance: number; rows: { id: string; type: string; amount: number; balanceAfter: number | null; reference: string | null; at: string }[] };

const DAY = 86_400_000;
const isoPlus = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export function AccountsTable({ rows, can }: { rows: Acc[]; can: { invoice: boolean; statement: boolean; prepaid: boolean; dispute: boolean } }) {
  const router = useRouter();
  const toast = useToast();
  const [statement, setStatement] = useState<Acc | null>(null);
  const [topup, setTopup] = useState<Acc | null>(null);
  const [ledger, setLedger] = useState<{ acc: Acc; data: Ledger } | null>(null);
  const invoice = useAction(invoiceCycleAction, { onSuccess: (r) => (r ? router.push(`/money/invoices/${r.id}`) : toast({ tone: "error", title: "No unbilled traffic in that cycle" })) });
  const stmt = useAction(vendorStatementAction, {
    onSuccess: (r) => {
      setStatement(null);
      toast(r.disputeId ? { tone: "error", title: "Statement doesn't match our rating — dispute opened", body: `Ours ${r.ourAmount.toFixed(2)}, theirs ${r.theirAmount.toFixed(2)}` } : { tone: "success", title: "Statement matches — bill ready for approval" });
    },
  });
  const post = useAction(postLedgerAction, { success: (r) => `Balance now ${r.balance.toFixed(2)}`, onSuccess: () => setTopup(null) });
  const loadLedger = useAction(ledgerAction, { refresh: false });

  return (
    <>
      <Card padded={false}>
        <CardHeader title="Accounts" description="Last closed cycle for each account. Customer invoices are also drafted automatically each morning." className="px-4 pt-3" />
        <Table>
          <THead><tr><Th>Account</Th><Th>Last cycle</Th><Th align="right">Unbilled</Th><Th align="right">Balance / exposure</Th><Th>Status</Th><Th /></tr></THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={6}>No carrier accounts.</TableEmpty>}
            {rows.map((a) => {
              const items: MenuItem[] = [];
              if (a.paymentMode === "PREPAID" && a.balance != null) items.push({ label: "View ledger", onSelect: async () => { const d = await loadLedger.run({ accountId: a.id }); if (d) setLedger({ acc: a, data: d }); } });
              if (a.paymentMode === "PREPAID" && can.prepaid) items.push({ label: "Top up / adjust", onSelect: () => setTopup(a) });
              return (
                <Tr key={a.id}>
                  <Td>
                    <p className="font-medium">{a.carrier}</p>
                    <p className="text-2xs text-ink-3">{a.side === "VENDOR" ? "Vendor" : "Customer"} · {a.terms} · {humanize(a.paymentMode)} · {a.currency}</p>
                  </Td>
                  <Td className="whitespace-nowrap text-[12.5px]">{formatDay(a.cycle.start)} – {formatDay(a.cycle.end)}<p className="text-2xs text-ink-3">due {formatDay(a.cycle.due)}</p></Td>
                  <Td align="right">{a.unbilledEntries ? <>{money(a.unbilledAmount, a.currency)}<p className="text-2xs text-ink-3">{num(a.unbilledMinutes)} min{a.currency !== "NGN" && ` · ${money(a.unbilledNgn)}`}</p></> : <span className="text-ink-3">—</span>}</Td>
                  <Td align="right">
                    {a.balance != null ? <><span className={cn(a.lowBalance && "font-medium text-danger")}>{money(a.balance, a.currency)}</span>{a.currency !== "NGN" && a.balanceNgn != null && <p className="text-2xs text-ink-3">{money(a.balanceNgn)}</p>}</> : a.exposure != null ? <>{money(a.exposure, a.currency)}<p className="text-2xs text-ink-3">{a.currency !== "NGN" && a.exposureNgn != null && `${money(a.exposureNgn, "NGN", { compact: true })} · `}{a.creditLimit != null && `limit ${money(a.creditLimit, a.currency, { compact: true })}`}</p></> : "—"}
                  </Td>
                  <Td>
                    {a.billed ? <Link href={a.side === "CUSTOMER" ? `/money/invoices/${a.billed.id}` : "/money/bills"} className="text-[12.5px] text-accent hover:underline">{a.billed.number ?? "Billed"}</Link> : a.credit === "over" ? <Badge tone="danger">Over credit limit</Badge> : a.credit === "warning" ? <Badge tone="warning">80% of limit</Badge> : a.lowBalance ? <Badge tone="danger">Low balance</Badge> : <span className="text-2xs text-ink-3">Not billed</span>}
                  </Td>
                  <Td align="right" className="whitespace-nowrap">
                    {a.side === "CUSTOMER" && can.invoice && !a.billed && a.unbilledEntries > 0 && <Button size="sm" variant="primary" loading={invoice.pending} onClick={() => invoice.run({ accountId: a.id, periodStart: a.cycle.start, periodEnd: isoPlus(a.cycle.end, 1) })}>Invoice cycle</Button>}
                    {a.side === "VENDOR" && can.statement && !a.billed && <Button size="sm" variant="secondary" onClick={() => setStatement(a)}>Record statement</Button>}
                    {items.length > 0 && <Menu items={items} />}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Dialog open={!!statement} onOpenChange={(o) => !o && setStatement(null)}>
        {statement && (
          <DialogContent title={`Statement from ${statement.carrier}`} description="We compare it with our own rating of the same period. Differences over 0.5% open a dispute and hold the bill." footer={<><Button variant="ghost" onClick={() => setStatement(null)}>Cancel</Button><Button variant="primary" type="submit" form="stmt" loading={stmt.pending}>Reconcile</Button></>}>
            <form id="stmt" className="grid gap-4" action={stmt.formAction((f) => ({ accountId: statement.id, periodStart: f.get("from"), periodEnd: f.get("to"), number: f.get("number") || undefined, theirMinutes: f.get("minutes"), theirAmount: f.get("amount"), issueDate: f.get("issued") }))}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Period from" htmlFor="st-from"><Input id="st-from" name="from" type="date" defaultValue={statement.cycle.start} required /></Field>
                <Field label="Period to" htmlFor="st-to"><Input id="st-to" name="to" type="date" defaultValue={statement.cycle.end} required /></Field>
                <Field label="Their minutes" htmlFor="st-min"><Input id="st-min" name="minutes" type="number" step="0.0001" min={0} required /></Field>
                <Field label={`Their amount (${statement.currency})`} htmlFor="st-amt"><Input id="st-amt" name="amount" type="number" step="0.01" min={0} required /></Field>
                <Field label="Statement number" htmlFor="st-num"><Input id="st-num" name="number" /></Field>
                <Field label="Issued" htmlFor="st-iss"><Input id="st-iss" name="issued" type="date" defaultValue={localDate(new Date())} required /></Field>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!topup} onOpenChange={(o) => !o && setTopup(null)}>
        {topup && (
          <DialogContent title={`Prepaid · ${topup.carrier}`} description="Usage is debited automatically as traffic is rated. You'll be asked for your password." footer={<><Button variant="ghost" onClick={() => setTopup(null)}>Cancel</Button><Button variant="primary" type="submit" form="topup" loading={post.pending}>Post</Button></>}>
            <form id="topup" className="grid gap-4" action={post.formAction((f) => ({ accountId: topup.id, type: f.get("type"), amount: f.get("amount"), reference: f.get("ref") || undefined }))}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Type" htmlFor="tp-type"><Select id="tp-type" name="type" defaultValue="TOPUP"><option value="TOPUP">Top-up</option><option value="ADJUSTMENT">Adjustment (+/−)</option><option value="REFUND">Refund</option></Select></Field>
                <Field label={`Amount (${topup.currency})`} htmlFor="tp-amt" error={post.errors.amount}><Input id="tp-amt" name="amount" type="number" step="0.01" required autoFocus /></Field>
              </div>
              <Field label="Reference" htmlFor="tp-ref"><Input id="tp-ref" name="ref" placeholder="Bank transfer reference" /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!ledger} onOpenChange={(o) => !o && setLedger(null)}>
        {ledger && (
          <SheetContent title={`${ledger.acc.carrier} · ledger`}>
            <p className="mb-3 text-[13px]">Balance <span className="font-semibold tabular">{money(ledger.data.balance, ledger.acc.currency)}</span></p>
            <ul className="grid gap-1.5 text-[13px]">
              {ledger.data.rows.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 border-b border-line py-1.5 last:border-0">
                  <span><span className="font-medium">{humanize(r.type)}</span><span className="block text-2xs text-ink-3">{formatDateTime(r.at)}{r.reference && ` · ${r.reference}`}</span></span>
                  <span className={cn("tabular", r.amount < 0 ? "text-ink-2" : "text-success")}>{r.amount > 0 ? "+" : ""}{r.amount.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </SheetContent>
        )}
      </Dialog>
    </>
  );
}

type Dispute = { id: string; carrier: string; side: string; currency: string; period: string; ourMinutes: number | null; theirMinutes: number | null; ourAmount: number | null; theirAmount: number | null; status: string; description: string; resolution: string | null; openedBy: string; openedAt: string; invoice: { id: string; number: string } | null; bill: { id: string; number: string | null } | null };

export function DisputesTable({ rows, accounts, canOpen, canEdit }: { rows: Dispute[]; accounts: { id: string; label: string }[]; canOpen: boolean; canEdit: boolean }) {
  const [opening, setOpening] = useState(false);
  const [editing, setEditing] = useState<Dispute | null>(null);
  const open = useAction(openDisputeAction, { success: "Dispute opened", onSuccess: () => setOpening(false) });
  const update = useAction(updateDisputeAction, { success: "Dispute updated", onSuccess: () => setEditing(null) });
  return (
    <>
      <Card padded={false}>
        <CardHeader title="Disputes" className="px-4 pt-3" actions={canOpen && accounts.length > 0 && <Button size="sm" variant="secondary" onClick={() => setOpening(true)}><Plus className="size-3.5" /> Open dispute</Button>} />
        <Table>
          <THead><tr><Th>Carrier</Th><Th>Period</Th><Th align="right">Ours</Th><Th align="right">Theirs</Th><Th>Status</Th><Th /></tr></THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={6}>No disputes.</TableEmpty>}
            {rows.map((d) => (
              <Tr key={d.id}>
                <Td>
                  <p className="font-medium">{d.carrier} <span className="font-normal text-ink-3">· {d.side === "VENDOR" ? "vendor" : "customer"}</span></p>
                  <p className="max-w-[340px] truncate text-2xs text-ink-3" title={d.description}>{d.description}</p>
                </Td>
                <Td muted className="whitespace-nowrap text-[12.5px]">{d.period}</Td>
                <Td align="right" className="text-[12.5px]">{d.ourAmount != null ? money(d.ourAmount, d.currency) : "—"}{d.ourMinutes != null && <p className="text-2xs text-ink-3">{num(d.ourMinutes)} min</p>}</Td>
                <Td align="right" className="text-[12.5px]">{d.theirAmount != null ? money(d.theirAmount, d.currency) : "—"}{d.theirMinutes != null && <p className="text-2xs text-ink-3">{num(d.theirMinutes)} min</p>}</Td>
                <Td><StatusBadge status={d.status} /></Td>
                <Td align="right">{canEdit && <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>Update</Button>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Dialog open={opening} onOpenChange={setOpening}>
        <DialogContent title="Open a dispute" footer={<><Button variant="ghost" onClick={() => setOpening(false)}>Cancel</Button><Button variant="primary" type="submit" form="disp" loading={open.pending}>Open</Button></>}>
          <form id="disp" className="grid gap-4" action={open.formAction((f) => ({ accountId: f.get("account"), periodStart: f.get("from"), periodEnd: f.get("to"), ourMinutes: f.get("om") || null, theirMinutes: f.get("tm") || null, ourAmount: f.get("oa") || null, theirAmount: f.get("ta") || null, description: f.get("desc") }))}>
            <Field label="Account" htmlFor="ds-acc"><Select id="ds-acc" name="account">{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From" htmlFor="ds-from"><Input id="ds-from" name="from" type="date" required /></Field>
              <Field label="To" htmlFor="ds-to"><Input id="ds-to" name="to" type="date" required /></Field>
              <Field label="Our minutes" htmlFor="ds-om"><Input id="ds-om" name="om" type="number" step="0.0001" min={0} /></Field>
              <Field label="Their minutes" htmlFor="ds-tm"><Input id="ds-tm" name="tm" type="number" step="0.0001" min={0} /></Field>
              <Field label="Our amount" htmlFor="ds-oa"><Input id="ds-oa" name="oa" type="number" step="0.01" min={0} /></Field>
              <Field label="Their amount" htmlFor="ds-ta"><Input id="ds-ta" name="ta" type="number" step="0.01" min={0} /></Field>
            </div>
            <Field label="What's wrong" htmlFor="ds-desc" error={open.errors.description}><Textarea id="ds-desc" name="desc" rows={3} required minLength={5} /></Field>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={`Dispute · ${editing.carrier}`} description={editing.description} footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" type="submit" form="dupd" loading={update.pending}>Save</Button></>}>
            <form id="dupd" className="grid gap-4" action={update.formAction((f) => ({ disputeId: editing.id, status: f.get("status"), resolution: f.get("res") || undefined }))}>
              <Field label="Status" htmlFor="du-st"><Select id="du-st" name="status" defaultValue={editing.status}>{["OPEN", "IN_REVIEW", "RESOLVED_IN_OUR_FAVOUR", "RESOLVED_IN_THEIR_FAVOUR", "SETTLED", "REJECTED"].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
              <Field label="Resolution" htmlFor="du-res" hint="Required when closing. Closing releases any held vendor bill for approval." error={update.errors.resolution}><Textarea id="du-res" name="res" rows={3} defaultValue={editing.resolution ?? ""} /></Field>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
