"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { generatePackAction, addendumAction, saveBankAction, savePayAction, saveProfileAction } from "@/server/modules/hr/actions";
import { Button } from "@/ui/button";
import { Dialog, DialogContent } from "@/ui/dialog";
import { Field, Input, Select, Textarea } from "@/ui/field";
import { useAction } from "@/ui/use-action";

type Opt = { id: string; name: string };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface ProfileValues {
  jobTitle: string;
  employmentType: string;
  startDate: string;
  probationEnds: string | null;
  phone: string | null;
  personalEmail: string | null;
  address: string | null;
  dateOfBirth: string | null;
  nextOfKin: { name: string; relationship: string; phone: string } | null;
  office: Opt | null;
  resumeTime: string;
  closeTime: string;
  workingDays: number[];
  graceMinutes: number;
  remoteAllowed: boolean;
  latenessPolicy: Opt | null;
}

export function ProfileButton({ userId, profile, offices, policies }: { userId: string; profile: ProfileValues | null; offices: Opt[]; policies: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number[]>(profile?.workingDays ?? [1, 2, 3, 4, 5]);
  const save = useAction(saveProfileAction, { success: "Profile saved", onSuccess: () => setOpen(false) });
  const p = profile;
  return (
    <>
      <Button variant={p ? "secondary" : "primary"} onClick={() => setOpen(true)}>{p ? "Edit profile" : "Create staff profile"}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Staff profile" className="max-w-[640px]" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="profile" loading={save.pending}>Save</Button></>}>
          <form
            id="profile"
            className="grid gap-4"
            action={save.formAction((f) => ({
              userId,
              jobTitle: f.get("job"),
              employmentType: f.get("type"),
              startDate: f.get("start"),
              probationEnds: f.get("probation") || null,
              phone: f.get("phone") || undefined,
              personalEmail: f.get("pemail") || "",
              address: f.get("address") || undefined,
              dateOfBirth: f.get("dob") || null,
              nextOfKin: f.get("kin") ? { name: String(f.get("kin")), relationship: String(f.get("kinrel") ?? ""), phone: String(f.get("kinphone") ?? "") } : null,
              officeId: f.get("office") || null,
              resumeTime: f.get("resume"),
              closeTime: f.get("close"),
              workingDays: days,
              graceMinutes: f.get("grace"),
              remoteAllowed: f.get("remote") === "on",
              latenessPolicyId: f.get("policy") || null,
            }))}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Job title" htmlFor="p-job" error={save.errors.jobTitle}><Input id="p-job" name="job" defaultValue={p?.jobTitle} required autoFocus /></Field>
              <Field label="Employment" htmlFor="p-type"><Select id="p-type" name="type" defaultValue={p?.employmentType ?? "FULL_TIME"}><option value="FULL_TIME">Full time</option><option value="PART_TIME">Part time</option><option value="CONTRACT">Contract</option><option value="INTERN">Intern</option><option value="NYSC">NYSC</option></Select></Field>
              <Field label="Start date" htmlFor="p-start"><Input id="p-start" name="start" type="date" defaultValue={p?.startDate} required /></Field>
              <Field label="Probation ends" htmlFor="p-prob"><Input id="p-prob" name="probation" type="date" defaultValue={p?.probationEnds ?? ""} /></Field>
              <Field label="Phone" htmlFor="p-phone"><Input id="p-phone" name="phone" defaultValue={p?.phone ?? ""} /></Field>
              <Field label="Personal email" htmlFor="p-pe" error={save.errors.personalEmail}><Input id="p-pe" name="pemail" type="email" defaultValue={p?.personalEmail ?? ""} /></Field>
              <Field label="Date of birth" htmlFor="p-dob"><Input id="p-dob" name="dob" type="date" defaultValue={p?.dateOfBirth ?? ""} /></Field>
              <Field label="Office" htmlFor="p-off"><Select id="p-off" name="office" defaultValue={p?.office?.id ?? ""}><option value="">—</option>{offices.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
            </div>
            <Field label="Address" htmlFor="p-addr"><Input id="p-addr" name="address" defaultValue={p?.address ?? ""} /></Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Next of kin" htmlFor="p-kin"><Input id="p-kin" name="kin" defaultValue={p?.nextOfKin?.name ?? ""} /></Field>
              <Field label="Relationship" htmlFor="p-kr"><Input id="p-kr" name="kinrel" defaultValue={p?.nextOfKin?.relationship ?? ""} /></Field>
              <Field label="Their phone" htmlFor="p-kp"><Input id="p-kp" name="kinphone" defaultValue={p?.nextOfKin?.phone ?? ""} /></Field>
            </div>
            <p className="text-[12.5px] font-medium text-ink-2">Work schedule (drives lateness)</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Resumes" htmlFor="p-res"><Input id="p-res" name="resume" type="time" defaultValue={p?.resumeTime ?? "09:00"} required /></Field>
              <Field label="Closes" htmlFor="p-close" error={save.errors.closeTime}><Input id="p-close" name="close" type="time" defaultValue={p?.closeTime ?? "17:00"} required /></Field>
              <Field label="Grace (min)" htmlFor="p-grace"><Input id="p-grace" name="grace" type="number" min={0} max={120} defaultValue={p?.graceMinutes ?? 0} /></Field>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Working days">
              {DAYS.map((d, i) => {
                const n = i + 1;
                const on = days.includes(n);
                return <button key={d} type="button" aria-pressed={on} onClick={() => setDays((ds) => (on ? ds.filter((x) => x !== n) : [...ds, n].sort()))} className={`h-7 rounded-md border px-2.5 text-[12.5px] ${on ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-3"}`}>{d}</button>;
              })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Lateness policy" htmlFor="p-pol" hint="Blank = their unit's policy."><Select id="p-pol" name="policy" defaultValue={p?.latenessPolicy?.id ?? ""}><option value="">Unit default</option>{policies.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></Field>
              <label className="mt-6 flex items-center gap-2 text-[13px]"><input type="checkbox" name="remote" defaultChecked={p?.remoteAllowed} className="accent-[hsl(var(--accent))]" /> Can clock in remotely</label>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PayButton({ userId, salary, allowances }: { userId: string; salary: number | null; allowances: { name: string; amount: number }[] }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(allowances.length ? allowances.map((a) => ({ name: a.name, amount: String(a.amount) })) : [{ name: "Housing", amount: "" }, { name: "Transport", amount: "" }]);
  const save = useAction(savePayAction, { success: "Pay saved", onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{salary != null ? "Change pay" : "Set pay"}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Monthly pay" description="Encrypted at rest. The change is audited (without the figures) and needs your password." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="pay" loading={save.pending}>Save</Button></>}>
          <form id="pay" className="grid gap-4" action={save.formAction((f) => ({ userId, salary: f.get("salary"), allowances: rows.filter((r) => r.name.trim() && r.amount).map((r) => ({ name: r.name, amount: r.amount })) }))}>
            <Field label="Basic salary (₦ / month)" htmlFor="pay-sal" error={save.errors.salary}><Input id="pay-sal" name="salary" type="number" min={0} step="0.01" defaultValue={salary ?? ""} required autoFocus /></Field>
            <div className="grid gap-2">
              <p className="text-[12.5px] font-medium text-ink-2">Allowances</p>
              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_140px_32px] gap-2">
                  <Input aria-label="Allowance" value={r.name} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Input aria-label="Amount" type="number" min={0} value={r.amount} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} className="text-right" />
                  <button type="button" aria-label="Remove" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-danger"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" className="w-fit" onClick={() => setRows((rs) => [...rs, { name: "", amount: "" }])}><Plus className="size-3.5" /> Add allowance</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function BankButton({ userId, label = "Update bank details" }: { userId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const save = useAction(saveBankAction, { success: "Bank details saved", onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Salary bank account" description="Encrypted at rest. The account holder is always emailed when this changes. You'll be asked for your password." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="bank" loading={save.pending}>Save</Button></>}>
          <form id="bank" className="grid gap-4" action={save.formAction((f) => ({ userId, bankName: f.get("bank"), accountNumber: f.get("acct"), accountName: f.get("name"), idNumber: f.get("nin") || undefined }))} autoComplete="off">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bank" htmlFor="bk-bank" error={save.errors.bankName}><Input id="bk-bank" name="bank" required placeholder="e.g. GTBank" /></Field>
              <Field label="Account number" htmlFor="bk-acct" error={save.errors.accountNumber}><Input id="bk-acct" name="acct" inputMode="numeric" maxLength={10} pattern="\d{10}" required /></Field>
            </div>
            <Field label="Account name" htmlFor="bk-name" error={save.errors.accountName}><Input id="bk-name" name="name" required /></Field>
            <Field label="NIN (optional)" htmlFor="bk-nin"><Input id="bk-nin" name="nin" inputMode="numeric" maxLength={11} /></Field>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PackButtons({ userId, canPack, canAddendum }: { userId: string; canPack: boolean; canAddendum: boolean }) {
  const [open, setOpen] = useState(false);
  const pack = useAction(generatePackAction, { success: (r) => `Sent ${r.documents} documents to sign` });
  const add = useAction(addendumAction, { success: "Addendum sent", onSuccess: () => setOpen(false) });
  return (
    <div className="flex flex-wrap gap-2">
      {canPack && <Button variant="primary" loading={pack.pending} onClick={() => pack.run({ userId })}>Send contract pack</Button>}
      {canAddendum && <Button variant="secondary" onClick={() => setOpen(true)}>Issue addendum</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Contract addendum" description="Uses the approved addendum template. The staff member signs it in the app." footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="add" loading={add.pending}>Send</Button></>}>
          <form id="add" className="grid gap-4" action={add.formAction((f) => ({ userId, title: f.get("title"), body: f.get("body") }))}>
            <Field label="Title" htmlFor="ad-t"><Input id="ad-t" name="title" required placeholder="e.g. Change of role — Senior Developer" /></Field>
            <Field label="Terms" htmlFor="ad-b" error={add.errors.body}><Textarea id="ad-b" name="body" rows={6} required /></Field>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
