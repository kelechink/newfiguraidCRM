import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeductionsCard } from "@/components/hr/deductions";
import { ExitPanel } from "@/components/hr/exit-panel";
import { BankButton, PackButtons, PayButton, ProfileButton } from "@/components/hr/staff-forms";
import { localDate } from "@/domain/sop/schedule";
import { formatDay, money } from "@/lib/format";
import { can } from "@/server/authz/context";
import { NotFoundError } from "@/server/authz/errors";
import { requireCtx } from "@/server/auth/session";
import { listOffices } from "@/server/modules/attendance/service";
import { listDeductions, listPolicies } from "@/server/modules/hr/deductions-service";
import { staffPacks } from "@/server/modules/hr/contracts-service";
import { getExit } from "@/server/modules/hr/exit-service";
import { getStaff } from "@/server/modules/hr/staff-service";
import { Avatar } from "@/ui/avatar";
import { Card, CardHeader } from "@/ui/card";
import { humanize, StatusBadge } from "@/ui/status";
import { LinkTabs } from "@/ui/tabs";

export const metadata: Metadata = { title: "Staff member" };

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function StaffMemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const s = await getStaff(ctx, id).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!s) notFound();
  const tab = (await searchParams).tab ?? "profile";
  const month = localDate(new Date()).slice(0, 7);
  const canDeductions = can(ctx, "hr.deductions", "VIEW");
  const tabs = [
    { key: "profile", label: "Profile", href: `/team/staff/${id}` },
    ...(s.can.viewPay || s.can.viewBank ? [{ key: "pay", label: "Pay & bank", href: `/team/staff/${id}?tab=pay` }] : []),
    ...(canDeductions ? [{ key: "deductions", label: "Deductions", href: `/team/staff/${id}?tab=deductions` }] : []),
    ...(can(ctx, "hr.contracts", "VIEW") ? [{ key: "contracts", label: "Contracts", href: `/team/staff/${id}?tab=contracts` }] : []),
    ...(can(ctx, "hr.staff", "VIEW") ? [{ key: "exit", label: "Exit", href: `/team/staff/${id}?tab=exit` }] : []),
  ];
  const p = s.profile;
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-3 py-1.5"><dt className="text-ink-3">{k}</dt><dd className="text-right">{v || "—"}</dd></div>;

  return (
    <div className="grid gap-4">
      <Link href="/team/staff" className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" /> Staff</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar id={s.id} name={s.name} size={44} />
          <div>
            <h2 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight">{s.name} <StatusBadge status={s.status} /></h2>
            <p className="text-[13px] text-ink-3">{p?.jobTitle ?? s.role.name} · {s.unit?.name ?? "No unit"}{p && ` · ${p.employeeNo}`} · {s.email}</p>
          </div>
        </div>
        {s.can.edit && tab === "profile" && <ProfileButton userId={s.id} profile={p} offices={(await listOffices()).map((o) => ({ id: o.id, name: o.name }))} policies={(await listPolicies(ctx)).map((x) => ({ id: x.id, name: `${x.name} (${x.unit}, from ${x.effectiveFrom})` }))} />}
      </div>
      <LinkTabs tabs={tabs} active={tabs.some((t) => t.key === tab) ? tab : "profile"} />

      {tab === "profile" && (
        p ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Employment" />
              <dl className="text-[13px]">
                {row("Type", humanize(p.employmentType))}
                {row("Started", formatDay(p.startDate))}
                {row("Probation ends", p.probationEnds && formatDay(p.probationEnds))}
                {row("Role (access)", s.role.name)}
                {row("Onboarded", p.onboardedAt && formatDay(p.onboardedAt))}
              </dl>
            </Card>
            <Card>
              <CardHeader title="Schedule" />
              <dl className="text-[13px]">
                {row("Hours", `${p.resumeTime} – ${p.closeTime}`)}
                {row("Days", p.workingDays.map((d) => DAYS[d]).join(", "))}
                {row("Grace", `${p.graceMinutes} min`)}
                {row("Office", p.office?.name ?? (p.remoteAllowed ? "Remote allowed" : null))}
                {row("Lateness policy", p.latenessPolicy?.name ?? "Unit default")}
              </dl>
            </Card>
            <Card>
              <CardHeader title="Contact" />
              <dl className="text-[13px]">
                {row("Phone", p.phone)}
                {row("Personal email", p.personalEmail)}
                {row("Address", p.address)}
                {row("Date of birth", p.dateOfBirth && formatDay(p.dateOfBirth))}
                {row("Next of kin", p.nextOfKin && `${p.nextOfKin.name} (${p.nextOfKin.relationship}) ${p.nextOfKin.phone}`)}
              </dl>
            </Card>
          </div>
        ) : (
          <Card><p className="text-[13px] text-ink-3">No staff profile yet. Create one to set their schedule, pay and contracts.</p></Card>
        )
      )}

      {tab === "pay" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {s.pay && (
            <Card>
              <CardHeader title="Monthly pay" description="Encrypted at rest. Every view of someone else's pay is audited." actions={s.can.editPay && !s.self && p && <PayButton userId={s.id} salary={s.pay.salary} allowances={s.pay.allowances} />} />
              <dl className="text-[13px]">
                {row("Basic salary", s.pay.salary != null ? money(s.pay.salary) : "Not set")}
                {s.pay.allowances.map((a) => row(a.name, money(a.amount)))}
                {s.pay.salary != null && <div className="flex justify-between border-t border-line pt-2 font-semibold"><dt>Gross</dt><dd className="tabular">{money(s.pay.salary + s.pay.allowances.reduce((n, a) => n + a.amount, 0))}</dd></div>}
              </dl>
            </Card>
          )}
          {s.bank && (
            <Card>
              <CardHeader title="Bank & ID" actions={s.can.editBank && p && <BankButton userId={s.id} />} />
              <dl className="text-[13px]">
                {row("Bank", s.bank.bankName)}
                {row("Account", s.bank.accountMasked && <span className="font-mono">{s.bank.accountMasked}</span>)}
                {row("Account name", s.bank.accountName)}
                {row("NIN", s.bank.idMasked && <span className="font-mono">{s.bank.idMasked}</span>)}
              </dl>
            </Card>
          )}
        </div>
      )}

      {tab === "deductions" && canDeductions && (() => (
        <DeductionsTab userId={s.id} month={month} canWaive={can(ctx, "hr.deductions", "EDIT")} canAdd={can(ctx, "hr.deductions", "CREATE")} ctxUser={ctx.userId} />
      ))()}

      {tab === "contracts" && (
        <ContractsTab userId={s.id} status={s.status} canPack={can(ctx, "hr.contracts", "CREATE")} />
      )}

      {tab === "exit" && <ExitPanel userId={s.id} name={s.name} exit={await getExit(ctx, s.id)} canEdit={can(ctx, "hr.staff", "EDIT") && !s.self} canPay={can(ctx, "hr.salaries", "VIEW")} />}
    </div>
  );

  async function DeductionsTab(props: { userId: string; month: string; canWaive: boolean; canAdd: boolean; ctxUser: string }) {
    const d = await listDeductions(ctx, { userId: props.userId, month: props.month });
    return <DeductionsCard userId={props.userId} month={props.month} rows={d.rows} total={d.total} final={d.final} canWaive={props.canWaive && props.userId !== props.ctxUser} canAdd={props.canAdd && props.userId !== props.ctxUser} />;
  }

  async function ContractsTab(props: { userId: string; status: string; canPack: boolean }) {
    const packs = await staffPacks(ctx, props.userId);
    return (
      <div className="grid gap-4">
        <PackButtons userId={props.userId} canPack={props.canPack && ["INVITED", "ONBOARDING"].includes(props.status)} canAddendum={props.canPack && props.status === "ACTIVE"} />
        {packs.length === 0 && <Card><p className="text-[13px] text-ink-3">No contracts issued yet.</p></Card>}
        {packs.map((pk) => (
          <Card key={pk.id} padded={false}>
            <CardHeader title={`${humanize(pk.purpose)} pack`} description={`Sent ${pk.sentAt ? formatDay(pk.sentAt) : "—"}${pk.reminderCount ? ` · ${pk.reminderCount} reminder${pk.reminderCount > 1 ? "s" : ""}` : ""}`} actions={<StatusBadge status={pk.status} />} className="px-4 pt-3" />
            <ul className="divide-y divide-line">
              {pk.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                  <Link href={`/me/documents/${d.id}`} className="font-medium hover:text-accent">{d.title}</Link>
                  <span className="flex items-center gap-2 text-2xs text-ink-3">{d.signatures.map((sg) => `${sg.role === "STAFF" ? "Staff" : "Company"} ${sg.status}`).join(" · ")} <StatusBadge status={d.status} /></span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    );
  }
}
