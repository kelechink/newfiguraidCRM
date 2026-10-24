"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { addDays, localDate } from "@/domain/sop/schedule";
import { formatDay, money, pct } from "@/lib/format";
import { addSupplierPriceAction, createResaleAction, saveDomainAction, saveSupplierAction } from "@/server/modules/finance/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select } from "@/ui/field";
import { humanize } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { useToast } from "@/ui/toast";
import { UNIT_STYLE } from "@/ui/units";
import { useAction } from "@/ui/use-action";

const TYPES = ["DOMAIN", "HOSTING", "EMAIL", "LICENCE", "SSL", "SERVICE", "OTHER"] as const;
const CURRENCIES = ["NGN", "USD", "GBP", "EUR"];
type Opt = { id: string; name: string };

function useDialog() {
  const [open, setOpen] = useState(false);
  return { open, setOpen, show: () => setOpen(true), hide: () => setOpen(false) };
}

const footer = (form: string, pending: boolean, hide: () => void) => (
  <>
    <Button variant="ghost" onClick={hide}>Cancel</Button>
    <Button variant="primary" type="submit" form={form} loading={pending}>Save</Button>
  </>
);

// ── resale ───────────────────────────────────────────────────────────────────

type ResaleRow = { id: string; type: string; description: string; supplier: Opt; customer: Opt | null; unit: string; currency: string; cost: number; sale: number; margin: number; marginPct: number; purchasedOn: string };
type SupplierAgg = { supplier: string; count: number; costNgn: number; saleNgn: number; margin: number; marginPct: number };

export function ResaleView({ items, bySupplier, suppliers, units, customers, canCreate }: { items: ResaleRow[]; bySupplier: SupplierAgg[]; suppliers: Opt[]; units: Opt[]; customers: Opt[]; canCreate: boolean }) {
  const d = useDialog();
  const toast = useToast();
  const [cur, setCur] = useState("NGN");
  const save = useAction(createResaleAction, { success: "Purchase recorded", onSuccess: (r) => { d.hide(); if (r.warning) toast({ tone: "error", title: r.warning }); } });
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-3">Domains, hosting, licences and services bought to resell, with the margin on each.</p>
        {canCreate && <Button variant="primary" onClick={d.show} disabled={!suppliers.length} title={suppliers.length ? undefined : "Add a supplier first"}><Plus className="size-3.5" /> Record purchase</Button>}
      </div>
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Item</Th><Th>Supplier</Th><Th>Customer</Th><Th>Bought</Th><Th align="right">Cost</Th><Th align="right">Sold for</Th><Th align="right">Margin</Th></tr></THead>
          <tbody>
            {items.length === 0 && <TableEmpty colSpan={7}>No resale purchases yet.</TableEmpty>}
            {items.map((r) => (
              <Tr key={r.id}>
                <Td>
                  <p className="flex items-center gap-1.5 font-medium"><span className={cn("size-1.5 rounded-full", UNIT_STYLE[r.unit]?.dot)} />{r.description}</p>
                  <p className="text-2xs text-ink-3">{humanize(r.type)}</p>
                </Td>
                <Td muted>{r.supplier.name}</Td>
                <Td muted>{r.customer?.name ?? "—"}</Td>
                <Td muted className="whitespace-nowrap">{formatDay(r.purchasedOn)}</Td>
                <Td align="right">{money(r.cost, r.currency)}</Td>
                <Td align="right">{money(r.sale, r.currency)}</Td>
                <Td align="right" className={cn("font-medium", r.margin < 0 && "text-danger")}>{money(r.margin, r.currency)}<span className="ml-1.5 text-2xs font-normal text-ink-3">{pct(r.marginPct)}</span></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {bySupplier.length > 0 && (
        <Card padded={false}>
          <CardHeader title="Margin by supplier" description="In naira, at the rate captured on each purchase." className="px-4 pt-3" />
          <Table>
            <THead><tr><Th>Supplier</Th><Th align="right">Items</Th><Th align="right">Cost</Th><Th align="right">Sales</Th><Th align="right">Margin</Th></tr></THead>
            <tbody>
              {bySupplier.map((s) => (
                <Tr key={s.supplier}>
                  <Td className="font-medium">{s.supplier}</Td>
                  <Td align="right" muted>{s.count}</Td>
                  <Td align="right">{money(s.costNgn)}</Td>
                  <Td align="right">{money(s.saleNgn)}</Td>
                  <Td align="right" className={cn("font-medium", s.margin < 0 && "text-danger")}>{money(s.margin)}<span className="ml-1.5 text-2xs font-normal text-ink-3">{pct(s.marginPct)}</span></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <Dialog open={d.open} onOpenChange={d.setOpen}>
        <DialogContent title="Record a purchase for resale" footer={footer("resale", save.pending, d.hide)}>
          <form id="resale" className="grid gap-4" action={save.formAction((f) => ({ unitId: f.get("unit"), type: f.get("type"), description: f.get("desc"), supplierId: f.get("supplier"), contactId: f.get("contact") || null, costPrice: f.get("cost"), salePrice: f.get("sale"), currency: cur, fxRate: cur === "NGN" ? null : f.get("fx"), purchasedOn: f.get("date") }))}>
            <Field label="Description" htmlFor="r-desc" error={save.errors.description}><Input id="r-desc" name="desc" required autoFocus placeholder="e.g. acme.com.ng renewal, 1 year" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type" htmlFor="r-type"><Select id="r-type" name="type">{TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
              <Field label="Supplier" htmlFor="r-sup"><Select id="r-sup" name="supplier">{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Cost price" htmlFor="r-cost"><Input id="r-cost" name="cost" type="number" step="0.01" min={0} required /></Field>
              <Field label="Sale price" htmlFor="r-sale"><Input id="r-sale" name="sale" type="number" step="0.01" min={0} required /></Field>
              <Field label="Currency" htmlFor="r-cur"><Select id="r-cur" value={cur} onChange={(e) => setCur(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              {cur !== "NGN" ? <Field label={`Rate (₦ per ${cur})`} htmlFor="r-fx"><Input id="r-fx" name="fx" type="number" step="0.0001" min={0} required /></Field> : <span className="hidden sm:block" />}
              <Field label="Bought on" htmlFor="r-date"><Input id="r-date" name="date" type="date" defaultValue={localDate(new Date())} required /></Field>
              <Field label="Unit" htmlFor="r-unit"><Select id="r-unit" name="unit">{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            </div>
            {customers.length > 0 && <Field label="For customer" htmlFor="r-contact"><Select id="r-contact" name="contact" defaultValue=""><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── domains ──────────────────────────────────────────────────────────────────

type DomainRow = { id: string; name: string; registrar: string; client: Opt | null; cost: number; sell: number; currency: string; margin: number; expiresOn: string; daysLeft: number; autoRenew: boolean; status: string };

export function DomainsView({ rows, registrars, units, customers, canCreate }: { rows: DomainRow[]; registrars: Opt[]; units: Opt[]; customers: Opt[]; canCreate: boolean }) {
  const d = useDialog();
  const save = useAction(saveDomainAction, { success: "Domain saved", onSuccess: d.hide });
  const soon = rows.filter((r) => r.daysLeft <= 30 && r.status === "active").length;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-3">{rows.length} domains · {soon} expiring within 30 days. Alerts go out at 30, 14, 7 and 1 day.</p>
        {canCreate && <Button variant="primary" onClick={d.show} disabled={!registrars.length} title={registrars.length ? undefined : "Add a registrar as a supplier first"}><Plus className="size-3.5" /> Add domain</Button>}
      </div>
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Domain</Th><Th>Client</Th><Th>Registrar</Th><Th>Expires</Th><Th align="right">Cost</Th><Th align="right">Sell</Th><Th>Renewal</Th></tr></THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={7}>No domains in the registry.</TableEmpty>}
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-mono text-[12.5px] font-medium">{r.name}</Td>
                <Td muted>{r.client?.name ?? "—"}</Td>
                <Td muted>{r.registrar}</Td>
                <Td className={cn("whitespace-nowrap", r.daysLeft < 0 ? "font-medium text-danger" : r.daysLeft <= 14 ? "font-medium text-warning" : "text-ink-3")}>
                  {formatDay(r.expiresOn)}<span className="ml-1.5 text-2xs">{r.daysLeft < 0 ? `${-r.daysLeft}d ago` : `${r.daysLeft}d`}</span>
                </Td>
                <Td align="right">{money(r.cost, r.currency)}</Td>
                <Td align="right" className={cn(r.margin < 0 && "text-danger")}>{money(r.sell, r.currency)}</Td>
                <Td>{r.autoRenew ? <Badge tone="success">Auto-renew</Badge> : <Badge tone="warning">Manual</Badge>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Dialog open={d.open} onOpenChange={d.setOpen}>
        <DialogContent title="Add a domain" footer={footer("dom", save.pending, d.hide)}>
          <form id="dom" className="grid gap-4" action={save.formAction((f) => ({ name: f.get("name"), unitId: f.get("unit"), registrarId: f.get("registrar"), contactId: f.get("contact") || null, costPrice: f.get("cost"), sellPrice: f.get("sell"), currency: f.get("currency"), expiresOn: f.get("expires"), autoRenew: f.get("auto") === "on" }))}>
            <Field label="Domain" htmlFor="d-name" error={save.errors.name}><Input id="d-name" name="name" required autoFocus placeholder="example.com.ng" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Registrar" htmlFor="d-reg"><Select id="d-reg" name="registrar">{registrars.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Expires" htmlFor="d-exp"><Input id="d-exp" name="expires" type="date" defaultValue={addDays(localDate(new Date()), 365)} required /></Field>
              <Field label="Cost" htmlFor="d-cost"><Input id="d-cost" name="cost" type="number" step="0.01" min={0} required /></Field>
              <Field label="Sell price" htmlFor="d-sell"><Input id="d-sell" name="sell" type="number" step="0.01" min={0} required /></Field>
              <Field label="Currency" htmlFor="d-cur"><Select id="d-cur" name="currency" defaultValue="NGN">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Unit" htmlFor="d-unit"><Select id="d-unit" name="unit">{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
            </div>
            {customers.length > 0 && <Field label="Client" htmlFor="d-contact"><Select id="d-contact" name="contact" defaultValue=""><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="auto" className="accent-[hsl(var(--accent))]" /> Auto-renew at the registrar</label>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── suppliers & price comparison ─────────────────────────────────────────────

type SupplierRow = { id: string; name: string; kind: string | null; website: string | null; items: number; domains: number; prices: number };
type Comparison = { product: string; offers: { supplier: string; price: number; currency: string; checkedOn: string }[]; cheapest: string; spread: number };

export function SuppliersView({ suppliers, comparison, canCreate }: { suppliers: SupplierRow[]; comparison: Comparison[]; canCreate: boolean }) {
  const sup = useDialog();
  const price = useDialog();
  const saveSup = useAction(saveSupplierAction, { success: "Supplier added", onSuccess: sup.hide });
  const savePrice = useAction(addSupplierPriceAction, { success: "Price logged", onSuccess: price.hide });
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <Card padded={false}>
        <CardHeader title="Suppliers" className="px-4 pt-3" actions={canCreate && <Button size="sm" variant="secondary" onClick={sup.show}><Plus className="size-3.5" /> Add</Button>} />
        <Table>
          <THead><tr><Th>Name</Th><Th align="right">Purchases</Th><Th align="right">Domains</Th></tr></THead>
          <tbody>
            {suppliers.length === 0 && <TableEmpty colSpan={3}>No suppliers yet.</TableEmpty>}
            {suppliers.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <p className="font-medium">{s.name}</p>
                  <p className="text-2xs text-ink-3">{s.kind ? humanize(s.kind) : "Supplier"}{s.website && ` · ${s.website.replace(/^https?:\/\//, "")}`}</p>
                </Td>
                <Td align="right" muted>{s.items}</Td>
                <Td align="right" muted>{s.domains}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Card padded={false}>
        <CardHeader title="Price comparison" description="Latest price per supplier; cheapest first." className="px-4 pt-3" actions={canCreate && <Button size="sm" variant="secondary" onClick={price.show} disabled={!suppliers.length}><Plus className="size-3.5" /> Log price</Button>} />
        <Table>
          <THead><tr><Th>Product</Th><Th>Cheapest</Th><Th>Others</Th><Th align="right">Spread</Th></tr></THead>
          <tbody>
            {comparison.length === 0 && <TableEmpty colSpan={4}>Log supplier prices to compare them.</TableEmpty>}
            {comparison.map((c) => (
              <Tr key={c.product}>
                <Td className="font-medium">{c.product}</Td>
                <Td><span className="font-medium">{c.cheapest}</span> <span className="text-ink-3">{money(c.offers[0]!.price, c.offers[0]!.currency)}</span></Td>
                <Td muted className="text-[12px]">{c.offers.slice(1).map((o) => `${o.supplier} ${money(o.price, o.currency)}`).join(" · ") || "—"}</Td>
                <Td align="right">{c.offers.length > 1 ? money(c.spread, c.offers[0]!.currency) : "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Dialog open={sup.open} onOpenChange={sup.setOpen}>
        <DialogContent title="Add supplier" footer={footer("sup", saveSup.pending, sup.hide)}>
          <form id="sup" className="grid gap-4" action={saveSup.formAction((f) => ({ name: f.get("name"), kind: f.get("kind") || undefined, website: f.get("web") || "" }))}>
            <Field label="Name" htmlFor="su-name" error={saveSup.errors.name}><Input id="su-name" name="name" required autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kind" htmlFor="su-kind"><Select id="su-kind" name="kind" defaultValue="registrar"><option value="registrar">Registrar</option><option value="host">Host</option><option value="licence">Licence</option><option value="ssl">SSL</option><option value="services">Services</option></Select></Field>
              <Field label="Website" htmlFor="su-web" error={saveSup.errors.website}><Input id="su-web" name="web" type="url" placeholder="https://" /></Field>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={price.open} onOpenChange={price.setOpen}>
        <DialogContent title="Log a supplier price" footer={footer("price", savePrice.pending, price.hide)}>
          <form id="price" className="grid gap-4" action={savePrice.formAction((f) => ({ supplierId: f.get("supplier"), productKey: f.get("product"), type: f.get("type"), price: f.get("price"), currency: f.get("currency") }))}>
            <Field label="Product" htmlFor="pr-prod" hint="Use the same name across suppliers, e.g. “.com.ng 1 year”." error={savePrice.errors.productKey}><Input id="pr-prod" name="product" required autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Supplier" htmlFor="pr-sup"><Select id="pr-sup" name="supplier">{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Type" htmlFor="pr-type"><Select id="pr-type" name="type">{TYPES.map((t) => <option key={t} value={t}>{humanize(t)}</option>)}</Select></Field>
              <Field label="Price" htmlFor="pr-price"><Input id="pr-price" name="price" type="number" step="0.01" min={0} required /></Field>
              <Field label="Currency" htmlFor="pr-cur"><Select id="pr-cur" name="currency" defaultValue="NGN">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
