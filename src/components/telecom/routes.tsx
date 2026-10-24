"use client";

import { History, Plus } from "lucide-react";
import { useState } from "react";
import { localDate } from "@/domain/sop/schedule";
import { formatDay, money } from "@/lib/format";
import { rateHistoryAction, saveRouteAction, setRateAction } from "@/server/modules/telecom/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent, SheetContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { useAction } from "@/ui/use-action";

type Offer = { carrier: string; rate: number; currency: string };
type RouteRow = { id: string; destination: string; prefix: string; routeType: string; isActive: boolean; qualityNotes: string | null; manager: string | null; sell: Offer[]; buy: Offer[] | null; marginPerMin: number | null };
type Account = { id: string; label: string; side: string; currency: string };
type Hist = { id: string; carrier: string; side: string; rate: number; currency: string; from: string; to: string | null; by: string };

export function RoutesTable({ rows, accounts, canEditRoutes, canSetSell, canSetBuy }: { rows: RouteRow[]; accounts: Account[]; canEditRoutes: boolean; canSetSell: boolean; canSetBuy: boolean }) {
  const [adding, setAdding] = useState(false);
  const [rating, setRating] = useState<RouteRow | null>(null);
  const [hist, setHist] = useState<{ route: RouteRow; rows: Hist[] } | null>(null);
  const saveRoute = useAction(saveRouteAction, { success: "Route added", onSuccess: () => setAdding(false) });
  const setRate = useAction(setRateAction, { success: "Rate saved", onSuccess: () => setRating(null) });
  const history = useAction(rateHistoryAction, { refresh: false });
  const showBuy = rows.some((r) => r.buy !== null);
  const rateAccounts = accounts.filter((a) => (a.side === "CUSTOMER" ? canSetSell : canSetBuy));

  return (
    <>
      {canEditRoutes && <div className="flex justify-end"><Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-3.5" /> Add route</Button></div>}
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Destination</Th><Th>Prefix</Th><Th>Sell rates</Th>{showBuy && <Th>Buy rates</Th>}{showBuy && <Th align="right">Margin / min</Th>}<Th /></tr></THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={6}>No routes.</TableEmpty>}
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <p className="font-medium">{r.destination}{!r.isActive && <span className="ml-1.5 text-2xs text-ink-3">inactive</span>}</p>
                  <p className="text-2xs text-ink-3">{r.routeType}{r.manager && ` · ${r.manager}`}{r.qualityNotes && ` · ${r.qualityNotes}`}</p>
                </Td>
                <Td className="font-mono text-[12.5px]">{r.prefix}</Td>
                <Td className="text-[12.5px]">{r.sell.length ? r.sell.slice(0, 3).map((s) => <p key={s.carrier}><span className="tabular">{s.rate.toFixed(4)}</span> <span className="text-ink-3">{s.carrier}</span></p>) : <span className="text-ink-3">No sell rate</span>}</Td>
                {showBuy && <Td className="text-[12.5px]">{r.buy?.length ? r.buy.slice(0, 3).map((s, i) => <p key={s.carrier}><span className={cn("tabular", i === 0 && "font-medium")}>{s.rate.toFixed(4)}</span> <span className="text-ink-3">{s.carrier}</span></p>) : <span className="text-ink-3">No vendor</span>}</Td>}
                {showBuy && <Td align="right">{r.marginPerMin == null ? "—" : <Badge tone={r.marginPerMin < 0 ? "danger" : r.marginPerMin === 0 ? "warning" : "success"}>{r.marginPerMin.toFixed(4)}</Badge>}</Td>}
                <Td align="right" className="whitespace-nowrap">
                  <Button size="sm" variant="ghost" aria-label="Rate history" onClick={async () => { const rows = await history.run({ routeId: r.id }); if (rows) setHist({ route: r, rows }); }}><History className="size-3.5" /></Button>
                  {rateAccounts.length > 0 && <Button size="sm" variant="secondary" onClick={() => setRating(r)}>Set rate</Button>}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title="Add route" footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" type="submit" form="route" loading={saveRoute.pending}>Save</Button></>}>
          <form id="route" className="grid gap-4" action={saveRoute.formAction((f) => ({ destination: f.get("dest"), prefix: f.get("prefix"), routeType: f.get("type"), qualityNotes: f.get("notes") || undefined }))}>
            <Field label="Destination" htmlFor="rt-dest" error={saveRoute.errors.destination}><Input id="rt-dest" name="dest" required autoFocus placeholder="Nigeria – MTN Mobile" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prefix" htmlFor="rt-prefix" error={saveRoute.errors.prefix}><Input id="rt-prefix" name="prefix" inputMode="numeric" required placeholder="234803" /></Field>
              <Field label="Type" htmlFor="rt-type"><Select id="rt-type" name="type" defaultValue="CLI"><option value="CLI">CLI</option><option value="CC">CC</option><option value="TDM">TDM</option></Select></Field>
            </div>
            <Field label="Quality notes" htmlFor="rt-notes"><Input id="rt-notes" name="notes" placeholder="ASR, PDD, known issues" /></Field>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rating} onOpenChange={(o) => !o && setRating(null)}>
        {rating && (
          <DialogContent title={`Rate for ${rating.destination}`} description="The old rate is kept in history and ends where this one starts." footer={<><Button variant="ghost" onClick={() => setRating(null)}>Cancel</Button><Button variant="primary" type="submit" form="rate" loading={setRate.pending}>Save rate</Button></>}>
            <form id="rate" className="grid gap-4" action={setRate.formAction((f) => ({ routeId: rating.id, accountId: f.get("account"), ratePerMin: f.get("rate"), effectiveFrom: f.get("from") }))}>
              <Field label="Carrier account" htmlFor="ra-acc"><Select id="ra-acc" name="account">{rateAccounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.currency})</option>)}</Select></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Rate per minute" htmlFor="ra-rate" error={setRate.errors.ratePerMin}><Input id="ra-rate" name="rate" type="number" step="0.000001" min={0} required /></Field>
                <Field label="Effective from" htmlFor="ra-from"><Input id="ra-from" name="from" type="date" defaultValue={localDate(new Date())} required /></Field>
              </div>
            </form>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!hist} onOpenChange={(o) => !o && setHist(null)}>
        {hist && (
          <SheetContent title={`${hist.route.destination} · rate history`}>
            {hist.rows.length === 0 ? <p className="text-[13px] text-ink-3">No rates yet.</p> : (
              <ul className="grid gap-2">
                {hist.rows.map((h) => (
                  <li key={h.id} className="rounded-lg border border-line px-3 py-2 text-[13px]">
                    <p className="flex justify-between gap-3"><span className="font-medium">{h.carrier} <span className="font-normal text-ink-3">· {h.side === "VENDOR" ? "buy" : "sell"}</span></span><span className="tabular font-medium">{money(h.rate, h.currency, { decimals: 4 })}</span></p>
                    <p className="text-[12px] text-ink-3">{formatDay(h.from)} → {h.to ? formatDay(h.to) : "current"} · {h.by}</p>
                  </li>
                ))}
              </ul>
            )}
          </SheetContent>
        )}
      </Dialog>
    </>
  );
}
