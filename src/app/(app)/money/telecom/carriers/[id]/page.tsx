import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CarrierEditButton } from "@/components/telecom/carrier-add";
import { AccountCard, BankDetails } from "@/components/telecom/carriers";
import { ExportDeckButton } from "@/components/telecom/deck-buttons";
import { money } from "@/lib/format";
import { can } from "@/server/authz/context";
import { NotFoundError } from "@/server/authz/errors";
import { requireCtx } from "@/server/auth/session";
import { getCarrier } from "@/server/modules/telecom/carriers-service";
import { canSeeBuy } from "@/server/modules/telecom/scope";
import { listAssignableUsers } from "@/server/modules/users/service";
import { Badge } from "@/ui/badge";
import { Card, CardHeader } from "@/ui/card";
import { humanize } from "@/ui/status";

export const metadata: Metadata = { title: "Carrier" };

export default async function CarrierPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const c = await getCarrier(ctx, (await params).id).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!c) notFound();
  const people = (await listAssignableUsers(ctx, "telecom.carriers")).map((p) => ({ id: p.id, name: p.name }));
  const canEdit = can(ctx, "telecom.carriers", "EDIT");
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1"><dt className="text-ink-3">{label}</dt><dd className="text-right">{value}</dd></div>
  );
  return (
    <div className="grid gap-4">
      <Link href="/money/telecom/carriers" className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" /> Carriers</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight">{c.name}{!c.isActive && <Badge>Inactive</Badge>}</h2>
          <p className="text-[13px] text-ink-3">{humanize(c.type)}{c.legalName && ` · ${c.legalName}`}{c.country && ` · ${c.country}`}{c.nettingEnabled && " · netting on"}</p>
        </div>
        {canEdit && <CarrierEditButton carrier={c} people={people} />}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid content-start gap-4">
          {c.accounts.map((a) => (
            <AccountCard key={a.id} a={a} canEdit={canEdit} canCredit={can(ctx, "telecom.prepaid", "EDIT")}>
              <dl className="grid gap-x-8 text-[13px] sm:grid-cols-2">
                {row("Currency", a.currency)}
                {row("Cycle / payment", `${a.billingCycleDays}/${a.paymentTermDays}`)}
                {row("Increments", `${a.incrementFirst}/${a.incrementNext}`)}
                {row("Payment", humanize(a.paymentMode))}
                {"balance" in a && a.balance != null && row("Prepaid balance", <span className={a.lowBalance ? "font-medium text-danger" : ""}>{money(a.balance, a.currency)}</span>)}
                {"exposure" in a && a.exposure != null && row("Exposure", <>{money(a.exposure, a.currency)}{a.creditLimit != null && <span className="text-ink-3"> of {money(a.creditLimit, a.currency)}</span>}</>)}
                {a.lowBalanceAlert != null && row("Low-balance alert", money(a.lowBalanceAlert, a.currency))}
              </dl>
              {(a.side === "CUSTOMER" || canSeeBuy(ctx)) && can(ctx, "telecom.routes", "VIEW") && <div className="mt-3"><ExportDeckButton accountId={a.id} label={a.side === "CUSTOMER" ? "Export sell deck" : "Export buy rates"} /></div>}
            </AccountCard>
          ))}
          {c.notes && <Card><p className="whitespace-pre-wrap text-[13px] text-ink-2">{c.notes}</p></Card>}
        </div>
        <aside className="grid content-start gap-4">
          <Card>
            <dl className="grid text-[13px]">
              {row("Account manager", c.manager?.name ?? "—")}
              {row("NOC", c.nocEmail ?? "—")}
              {row("Billing", c.billingEmail ?? "—")}
              {row("Rates", c.ratesEmail ?? "—")}
              {c.address && row("Address", c.address)}
            </dl>
          </Card>
          <Card>
            <CardHeader title="Contacts" />
            {c.contacts.length === 0 ? <p className="text-[13px] text-ink-3">No contacts.</p> : (
              <ul className="grid gap-2.5 text-[13px]">
                {c.contacts.map((p, i) => (
                  <li key={i}>
                    <p className="font-medium">{p.name}{p.role && <span className="font-normal text-ink-3"> · {p.role}</span>}</p>
                    <p className="text-[12px] text-ink-3">{[p.phone, p.email].filter(Boolean).join(" · ") || "—"}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {can(ctx, "telecom.billing", "EDIT") && <Card><BankDetails carrierId={c.id} masked={c.bankDetailsMasked} current={null} /></Card>}
        </aside>
      </div>
    </div>
  );
}
