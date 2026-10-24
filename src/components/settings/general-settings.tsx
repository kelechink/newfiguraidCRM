"use client";

import { MapPin, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatDay } from "@/lib/format";
import { saveOfficeAction } from "@/server/modules/attendance/actions";
import { addHolidayAction, removeHolidayAction, saveSettingAction } from "@/server/modules/settings/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input } from "@/ui/field";
import { useAction } from "@/ui/use-action";

type Office = { id: string; name: string; address: string | null; latitude: number; longitude: number; radiusM: number; isActive: boolean; staff: number };

const RULES: { key: string; label: string; hint: string; suffix?: string }[] = [
  { key: "telecom.margin_alert_pct", label: "Telecom margin alert", hint: "Alert when a route's margin falls below this.", suffix: "%" },
  { key: "finance.min_cash_balance_ngn", label: "Minimum cash balance", hint: "Cash-flow forecast warns when a week dips below this.", suffix: "₦" },
  { key: "payroll.signoff_limit_ngn", label: "Payroll sign-off limit", hint: "Payroll runs above this need Super Admin sign-off.", suffix: "₦" },
  { key: "finance.vat_rate_pct", label: "VAT rate", hint: "Default on new invoices.", suffix: "%" },
  { key: "finance.usd_ngn_rate", label: "Default USD → NGN rate", hint: "Pre-filled on USD transactions; each transaction keeps its own rate.", suffix: "₦" },
  { key: "inbox.sla_minutes", label: "Inbox response SLA", hint: "Unanswered conversations escalate after this.", suffix: "min" },
  { key: "privacy.dsr_days", label: "Data request deadline", hint: "Days to answer access/deletion requests (confirm with your DPO).", suffix: "days" },
];

function OfficeDialog({ office, onClose }: { office: Office | null; onClose: () => void }) {
  const save = useAction(saveOfficeAction, { success: "Office saved", onSuccess: onClose });
  const [coords, setCoords] = useState({ lat: office?.latitude ?? 9.0579, lng: office?.longitude ?? 7.4951 });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={office ? `Edit ${office.name}` : "Add an office"}
        description="Staff must be within the radius to clock in without a flag."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" type="submit" form="office" loading={save.pending}>Save</Button>
          </>
        }
      >
        <form
          id="office"
          className="grid gap-4"
          action={save.formAction((f) => ({ id: office?.id, name: f.get("name"), address: f.get("address") || undefined, latitude: coords.lat, longitude: coords.lng, radiusM: f.get("radius"), isActive: f.get("active") === "on" }))}
        >
          <Field label="Name" htmlFor="o-name"><Input id="o-name" name="name" defaultValue={office?.name} required placeholder="Abuja HQ" /></Field>
          <Field label="Address" htmlFor="o-addr"><Input id="o-addr" name="address" defaultValue={office?.address ?? ""} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Latitude" htmlFor="o-lat"><Input id="o-lat" type="number" step="0.000001" value={coords.lat} onChange={(e) => setCoords({ ...coords, lat: Number(e.target.value) })} required /></Field>
            <Field label="Longitude" htmlFor="o-lng"><Input id="o-lng" type="number" step="0.000001" value={coords.lng} onChange={(e) => setCoords({ ...coords, lng: Number(e.target.value) })} required /></Field>
            <Field label="Radius (m)" htmlFor="o-rad"><Input id="o-rad" name="radius" type="number" min={10} max={5000} defaultValue={office?.radiusM ?? 100} required /></Field>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="justify-self-start"
            onClick={() => navigator.geolocation?.getCurrentPosition((p) => setCoords({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }), undefined, { enableHighAccuracy: true })}
          >
            <MapPin className="size-3.5" /> Use my current location (stand inside the office)
          </Button>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" name="active" defaultChecked={office?.isActive ?? true} className="size-3.5 accent-[hsl(var(--accent))]" /> Active</label>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GeneralSettings({ offices, settings, holidays, canEdit }: { offices: Office[]; settings: Record<string, number | string>; holidays: { id: string; date: string; name: string }[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<Office | "new" | null>(null);
  const saveSetting = useAction(saveSettingAction, { success: "Saved" });
  const addHoliday = useAction(addHolidayAction, { success: "Holiday added" });
  const removeHoliday = useAction(removeHolidayAction, { success: "Holiday removed" });

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card padded={false}>
        <div className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardHeader title="Offices (clock-in geofence)" description="Default radius 100 m." actions={canEdit && <Button size="sm" variant="secondary" onClick={() => setEditing("new")}><Plus className="size-3.5" /> Add office</Button>} />
        </div>
        <ul className="divide-y divide-line">
          {offices.length === 0 && <li className="px-5 py-8 text-center text-[13px] text-ink-3">No offices yet — add Abuja HQ so staff can clock in.</li>}
          {offices.map((o) => (
            <li key={o.id} className="flex items-center gap-3 px-5 py-3">
              <MapPin className="size-4 text-ink-3" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">{o.name} {!o.isActive && <Badge>Inactive</Badge>}</p>
                <p className="text-2xs text-ink-3 tabular">{o.latitude.toFixed(5)}, {o.longitude.toFixed(5)} · {o.radiusM} m · {o.staff} staff</p>
              </div>
              {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(o)}>Edit</Button>}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Business rules" description="Thresholds used across the app. Changes are audited." />
        <div className="grid gap-3">
          {RULES.map((r) => (
            <form key={r.key} className="grid grid-cols-[1fr_140px_auto] items-end gap-2" action={saveSetting.formAction((f) => ({ key: r.key, value: Number(f.get("v")) }))}>
              <div>
                <p className="text-[13px] font-medium">{r.label}</p>
                <p className="text-2xs text-ink-3">{r.hint}</p>
              </div>
              <div className="relative">
                <Input name="v" type="number" step="any" min={0} defaultValue={String(settings[r.key] ?? "")} disabled={!canEdit} className="pr-10 text-right tabular" aria-label={r.label} />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-2xs text-ink-3">{r.suffix}</span>
              </div>
              {canEdit && <Button size="sm" type="submit" variant="ghost">Save</Button>}
            </form>
          ))}
        </div>
      </Card>

      <Card padded={false}>
        <div className="p-4 pb-2 sm:p-5 sm:pb-2">
          <CardHeader title="Public holidays" description="Never counted as absence; SOP tasks skip them." />
        </div>
        <ul className="divide-y divide-line">
          {holidays.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
              <span className="w-28 tabular text-ink-2">{formatDay(h.date, { weekday: true })}</span>
              <span className="flex-1">{h.name}</span>
              {canEdit && <button onClick={() => removeHoliday.run(h.id)} className="rounded p-1 text-ink-3 hover:bg-danger/10 hover:text-danger" aria-label={`Remove ${h.name}`}><Trash2 className="size-3.5" /></button>}
            </li>
          ))}
        </ul>
        {canEdit && (
          <form className="flex flex-wrap items-end gap-2 border-t border-line p-4" action={addHoliday.formAction((f) => ({ date: f.get("date"), name: f.get("name") }))}>
            <Field label="Date" htmlFor="h-date"><Input id="h-date" name="date" type="date" required /></Field>
            <Field label="Name" htmlFor="h-name"><Input id="h-name" name="name" required placeholder="Eid-el-Kabir" /></Field>
            <Button type="submit" variant="secondary" loading={addHoliday.pending}><Plus className="size-3.5" /> Add</Button>
          </form>
        )}
      </Card>
      {editing && <OfficeDialog office={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
