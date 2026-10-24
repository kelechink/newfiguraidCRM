"use client";

import { FileUp, Plus } from "lucide-react";
import { useState } from "react";
import { addDays, localDate } from "@/domain/sop/schedule";
import { enterTrafficAction, importCdrAction } from "@/server/modules/telecom/actions";
import { Button } from "@/ui/button";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { useToast } from "@/ui/toast";
import { useAction } from "@/ui/use-action";

type Opt = { id: string; label: string };

export function TrafficButtons({ routes, vendors, customers }: { routes: Opt[]; vendors: Opt[]; customers: Opt[] }) {
  const toast = useToast();
  const [entry, setEntry] = useState(false);
  const [cdr, setCdr] = useState(false);
  const enter = useAction(enterTrafficAction, {
    success: "Traffic rated",
    onSuccess: (r) => {
      setEntry(false);
      if (r.alert) toast({ tone: "error", title: r.alert === "negative" ? "Negative margin on this traffic" : "Margin below threshold", body: r.marginPct != null ? `${r.marginPct}% margin` : undefined });
    },
  });
  const upload = useAction(importCdrAction, {
    success: (r) => `Rated ${r.calls - r.rejected} of ${r.calls} calls`,
    onSuccess: (r) => {
      setCdr(false);
      if (r.rejected) toast({ tone: "error", title: `${r.rejected} calls couldn't be rated`, body: r.errors.slice(0, 3).map((e) => `Line ${e.line}: ${e.message}`).join(" · ") });
    },
  });
  const yesterday = addDays(localDate(new Date()), -1);
  const ready = routes.length > 0 && vendors.length > 0 && customers.length > 0;
  const pickers = (p: string) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Vendor (buy)" htmlFor={`${p}-v`}><Select id={`${p}-v`} name="vendorAccountId">{vendors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></Field>
      <Field label="Customer (sell)" htmlFor={`${p}-c`}><Select id={`${p}-c`} name="customerAccountId">{customers.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</Select></Field>
    </div>
  );
  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={() => setCdr(true)} disabled={!ready}><FileUp className="size-3.5" /> Upload CDRs</Button>
      <Button variant="primary" onClick={() => setEntry(true)} disabled={!ready} title={ready ? undefined : "Add routes and vendor/customer carriers first"}><Plus className="size-3.5" /> Enter minutes</Button>

      <Dialog open={entry} onOpenChange={setEntry}>
        <DialogContent title="Enter traffic" description="From the switch report. Each side is rated with its own increments and the rate in force on the day." footer={<><Button variant="ghost" onClick={() => setEntry(false)}>Cancel</Button><Button variant="primary" type="submit" form="traffic" loading={enter.pending}>Rate traffic</Button></>}>
          <form id="traffic" className="grid gap-4" action={enter.formAction((f) => ({ periodStart: `${f.get("from")}T00:00:00Z`, periodEnd: `${f.get("to")}T23:59:59Z`, routeId: f.get("route"), vendorAccountId: f.get("vendorAccountId"), customerAccountId: f.get("customerAccountId"), minutes: f.get("minutes"), calls: f.get("calls") || null, connectedCalls: f.get("connected") || null }))}>
            <Field label="Route" htmlFor="tr-route"><Select id="tr-route" name="route">{routes.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></Field>
            {pickers("tr")}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From" htmlFor="tr-from"><Input id="tr-from" name="from" type="date" defaultValue={yesterday} required /></Field>
              <Field label="To" htmlFor="tr-to" error={enter.errors.periodEnd}><Input id="tr-to" name="to" type="date" defaultValue={yesterday} required /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Minutes (raw)" htmlFor="tr-min" error={enter.errors.minutes}><Input id="tr-min" name="minutes" type="number" step="0.0001" min={0} required /></Field>
              <Field label="Attempts" htmlFor="tr-calls"><Input id="tr-calls" name="calls" type="number" min={0} /></Field>
              <Field label="Connected" htmlFor="tr-conn" error={enter.errors.connectedCalls}><Input id="tr-conn" name="connected" type="number" min={0} /></Field>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={cdr} onOpenChange={setCdr}>
        <DialogContent title="Upload CDRs" description="CSV with start time, called number and billed seconds. Every call is matched to the longest prefix and rated individually." footer={<><Button variant="ghost" onClick={() => setCdr(false)}>Cancel</Button><Button variant="primary" type="submit" form="cdr" loading={upload.pending}>Upload and rate</Button></>}>
          <form id="cdr" className="grid gap-4" action={upload.formAction((f) => f)}>
            {pickers("cd")}
            <Field label="CDR file" htmlFor="cd-file" hint="Up to 25 MB."><Input id="cd-file" name="file" type="file" accept=".csv,text/csv" required /></Field>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
