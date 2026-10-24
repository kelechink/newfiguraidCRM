"use client";

import { Copy, Plus } from "lucide-react";
import { useState } from "react";
import { money } from "@/lib/format";
import { createReferrerAction, decidePayoutAction, requestPayoutAction } from "@/server/modules/growth/actions";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { humanize, StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { useToast } from "@/ui/toast";
import { useAction } from "@/ui/use-action";

type Referrer = { id: string; name: string; type: string; code: string; link: string; referred: number; won: number; earned: number; owed: number };
type Payout = { id: string; referrer: string; amount: number; currency: string; status: string; referrals: number; approvedBy: string | null };

export function Referrals({ referrers, payouts, can }: { referrers: Referrer[]; payouts: Payout[]; can: { create: boolean; request: boolean; approve: boolean } }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const create = useAction(createReferrerAction, { success: "Referrer added", onSuccess: () => setOpen(false) });
  const request = useAction(requestPayoutAction, { success: "Payout sent for approval" });
  const decide = useAction(decidePayoutAction, { success: "Payout decided" });
  return (
    <div className="grid gap-4">
      <Card padded={false}>
        <CardHeader title="Referrers" description="Each gets a link (/r/CODE). Commission is paid when the referred deal is won." className="px-4 pt-3" actions={can.create && <Button size="sm" variant="primary" onClick={() => setOpen(true)}><Plus className="size-3.5" /> Add referrer</Button>} />
        <Table>
          <THead><tr><Th>Referrer</Th><Th>Link</Th><Th align="right">Referred</Th><Th align="right">Won</Th><Th align="right">Earned</Th><Th align="right">Owed</Th><Th /></tr></THead>
          <tbody>
            {referrers.length === 0 && <TableEmpty colSpan={7}>No referrers yet.</TableEmpty>}
            {referrers.map((r) => (
              <Tr key={r.id}>
                <Td><p className="font-medium">{r.name}</p><p className="text-2xs text-ink-3">{humanize(r.type)}</p></Td>
                <Td><button type="button" onClick={() => { void navigator.clipboard.writeText(r.link); toast({ tone: "success", title: "Link copied" }); }} className="inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-2 hover:text-accent">{r.code}<Copy className="size-3" /></button></Td>
                <Td align="right" muted>{r.referred}</Td>
                <Td align="right" muted>{r.won}</Td>
                <Td align="right">{money(r.earned)}</Td>
                <Td align="right" className="font-medium">{r.owed ? money(r.owed) : "—"}</Td>
                <Td align="right">{can.request && r.owed > 0 && <Button size="sm" variant="secondary" onClick={() => request.run(r.id)} loading={request.pending}>Request payout</Button>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card padded={false}>
        <CardHeader title="Payouts" description="Approved payouts are recorded as expenses in Finance." className="px-4 pt-3" />
        <Table>
          <THead><tr><Th>Referrer</Th><Th align="right">Referrals</Th><Th align="right">Amount</Th><Th>Status</Th><Th /></tr></THead>
          <tbody>
            {payouts.length === 0 && <TableEmpty colSpan={5}>No payouts.</TableEmpty>}
            {payouts.map((p) => (
              <Tr key={p.id}>
                <Td className="font-medium">{p.referrer}</Td>
                <Td align="right" muted>{p.referrals}</Td>
                <Td align="right">{money(p.amount, p.currency)}</Td>
                <Td><StatusBadge status={p.status} />{p.approvedBy && <span className="ml-1.5 text-2xs text-ink-3">{p.approvedBy}</span>}</Td>
                <Td align="right" className="whitespace-nowrap">{can.approve && p.status === "PENDING" && <><Button size="sm" variant="ghost" onClick={() => decide.run({ payoutId: p.id, approve: false })}>Reject</Button><Button size="sm" variant="primary" onClick={() => decide.run({ payoutId: p.id, approve: true })} loading={decide.pending}>Approve</Button></>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Add a referrer" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="refr" loading={create.pending}>Save</Button></>}>
          <form id="refr" className="grid gap-4" action={create.formAction((f) => ({ type: f.get("type"), name: f.get("name"), email: f.get("email") || "" }))}>
            <Field label="Name" htmlFor="rf-n"><Input id="rf-n" name="name" required autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" htmlFor="rf-t"><Select id="rf-t" name="type"><option value="CUSTOMER">Customer</option><option value="GRADUATE">Academy graduate</option><option value="PARTNER">Partner</option></Select></Field>
              <Field label="Email" htmlFor="rf-e" error={create.errors.email}><Input id="rf-e" name="email" type="email" /></Field>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
