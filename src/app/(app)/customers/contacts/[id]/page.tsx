import type { Metadata } from "next";
import Link from "next/link";
import { ActivityComposer, ContactActions, DuplicateBanner } from "@/components/crm/contact-detail";
import { scoreBand } from "@/domain/crm/contacts";
import { ago, formatDateTime, money } from "@/lib/format";
import { requireCtx } from "@/server/auth/session";
import { channelLabel, getContact } from "@/server/modules/crm/contacts-service";
import { listAssignableUsers } from "@/server/modules/users/service";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { Card, CardHeader } from "@/ui/card";
import { cn } from "@/ui/cn";
import { StatusBadge } from "@/ui/status";
import { UNIT_STYLE } from "@/ui/units";

export const metadata: Metadata = { title: "Contact" };

const ICON: Record<string, string> = {
  NOTE: "📝", CALL: "📞", MEETING: "🤝", EMAIL_SENT: "✉️", EMAIL_OPENED: "👀", EMAIL_CLICKED: "🔗", EMAIL_REPLIED: "↩️", MESSAGE: "💬",
  STAGE_CHANGED: "➡️", DEAL_CREATED: "✨", DEAL_WON: "🏆", DEAL_LOST: "✖️", INVOICE: "🧾", PAYMENT: "💰", TICKET: "🎫",
  FORM_SUBMITTED: "📋", MERGED: "🔀", MISSED_CALL: "📵", SMS: "📱",
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 py-1.5 text-[13px]">
      <span className="text-ink-3">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const c = await getContact(ctx, id);
  const owners = c.canEdit ? await listAssignableUsers(ctx, "crm.contacts") : [];
  const consent = (v: boolean | null) => (v === null ? <span className="text-ink-3">Not asked</span> : v ? <Badge tone="success">Opted in</Badge> : <Badge tone="danger">Opted out</Badge>);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar id={c.id} name={c.name} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-[-0.02em]">{c.name}</h1>
            <StatusBadge status={c.lifecycle} />
            <Badge tone={scoreBand(c.score) === "hot" ? "danger" : scoreBand(c.score) === "warm" ? "warning" : "neutral"}>Score {c.score}</Badge>
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-ink-3">
            {c.company && <span>{c.company.name}</span>}
            <span className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", UNIT_STYLE[c.unit.code]?.dot)} />{c.unit.name}</span>
            <span>Owner: {c.owner?.name ?? "Unassigned"}</span>
            <span>Added {ago(c.createdAt)}</span>
          </p>
        </div>
        {c.canEdit && <ContactActions contact={{ id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, ownerId: c.owner?.id ?? null, lifecycle: c.lifecycle, company: c.company?.name ?? null, budget: c.budget }} owners={owners.map((o) => ({ id: o.id, name: o.name }))} />}
      </div>

      {c.duplicates.length > 0 && c.canEdit && <DuplicateBanner survivorId={c.id} duplicates={c.duplicates} />}

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Details" />
            <Row label="Email">{c.email ? <a className="text-accent hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : "—"}</Row>
            <Row label="Phone">{c.phone ? <a className="tabular text-accent hover:underline" href={`tel:${c.phone}`}>{c.phone}</a> : "—"}</Row>
            <Row label="Budget">{c.budget ? money(c.budget) : "—"}</Row>
            <Row label="Source">{channelLabel(c.source.channel)}{c.source.detail && <span className="block text-2xs text-ink-3">{c.source.detail}</span>}</Row>
            {(c.source.utmCampaign || c.source.utmSource) && <Row label="Campaign">{[c.source.utmSource, c.source.utmMedium, c.source.utmCampaign].filter(Boolean).join(" / ")}</Row>}
            {c.source.referralCode && <Row label="Referred by">{c.source.referralCode}</Row>}
            {c.tags.length > 0 && <Row label="Tags"><span className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span></Row>}
          </Card>
          <Card>
            <CardHeader title="Consent" description="Marketing email & WhatsApp (NDPA 2023)." />
            <Row label="Email">{consent(c.consent.email)}</Row>
            <Row label="WhatsApp">{consent(c.consent.whatsapp)}</Row>
            <Row label="SMS">{consent(c.consent.sms)}</Row>
          </Card>
          <Card>
            <CardHeader title="Deals" />
            {c.deals.length === 0 && <p className="text-[13px] text-ink-3">No deals yet.</p>}
            <ul className="grid gap-2">
              {c.deals.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0"><span className="block truncate font-medium">{d.title}</span><span className="text-2xs text-ink-3">{d.pipeline} · {d.stage}</span></span>
                  <span className="text-right"><span className="block tabular">{money(d.value, d.currency, { compact: true })}</span><StatusBadge status={d.status} /></span>
                </li>
              ))}
            </ul>
          </Card>
          {c.conversations.length > 0 && (
            <Card>
              <CardHeader title="Conversations" />
              <ul className="grid gap-2">
                {c.conversations.map((v) => (
                  <li key={v.id}>
                    <Link href={`/customers/inbox?c=${v.id}`} className="block rounded-md p-1.5 text-[12.5px] hover:bg-surface-2">
                      <span className="flex justify-between"><span className="font-medium">{v.channelName}</span><span className="text-2xs text-ink-3">{ago(v.at)}</span></span>
                      <span className="line-clamp-1 text-ink-3">{v.last}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {c.invoices.length > 0 && (
            <Card>
              <CardHeader title="Invoices" />
              <ul className="grid gap-1.5">
                {c.invoices.map((i) => (
                  <li key={i.id}><Link href={`/money/invoices/${i.id}`} className="flex justify-between text-[12.5px] hover:underline"><span className="font-mono">{i.number}</span><span className="tabular">{money(i.total, i.currency)} <StatusBadge status={i.status} /></span></Link></li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader title="Timeline" description="Messages, calls, notes, stage changes, forms, invoices and tickets in one place." />
          <ActivityComposer contactId={c.id} />
          <ol className="mt-4 grid gap-0">
            {c.timeline.length === 0 && <li className="py-8 text-center text-[13px] text-ink-3">Nothing yet.</li>}
            {c.timeline.map((a, i) => (
              <li key={a.id} className="relative grid grid-cols-[28px_1fr] gap-3 pb-4">
                {i < c.timeline.length - 1 && <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-line" />}
                <span className="flex size-7 items-center justify-center rounded-full border border-line bg-surface text-[13px]" aria-hidden>{ICON[a.type] ?? "•"}</span>
                <div className="min-w-0 pt-0.5">
                  <p className="whitespace-pre-wrap text-[13px]">{a.summary}</p>
                  <p className="text-2xs text-ink-3">{a.actor ? `${a.actor} · ` : ""}{formatDateTime(a.at)}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
