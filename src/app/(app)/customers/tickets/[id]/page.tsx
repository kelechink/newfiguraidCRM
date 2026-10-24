import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TicketControls, TicketThread } from "@/components/support/tickets";
import { formatDateTime } from "@/lib/format";
import { can } from "@/server/authz/context";
import { ForbiddenError, NotFoundError } from "@/server/authz/errors";
import { requireCtx } from "@/server/auth/session";
import { getTicket } from "@/server/modules/support/service";
import { listAssignableUsers } from "@/server/modules/users/service";
import { Card } from "@/ui/card";
import { StatusBadge } from "@/ui/status";

export const metadata: Metadata = { title: "Ticket" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const t = await getTicket(ctx, (await params).id).catch((e) => (e instanceof NotFoundError || e instanceof ForbiddenError ? null : Promise.reject(e)));
  if (!t) notFound();
  const people = (await listAssignableUsers(ctx, "support.tickets")).map((p) => ({ id: p.id, name: p.name }));
  const canEdit = can(ctx, "support.tickets", "EDIT");
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-3 py-1"><dt className="text-ink-3">{k}</dt><dd className="text-right">{v}</dd></div>;
  return (
    <div className="grid gap-4">
      <Link href="/customers/tickets" className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" /> Tickets</Link>
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-[20px] font-semibold tracking-tight">{t.subject} <StatusBadge status={t.status} /></h1>
        <p className="text-[13px] text-ink-3">{t.number} · {t.unit.name} · opened {formatDateTime(t.createdAt)} via {t.source.replace("_", " ")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <TicketThread ticketId={t.id} comments={t.comments} canReply={canEdit && t.status !== "CLOSED"} hasEmail={!!t.contact.email} />
        <aside className="grid content-start gap-4">
          <Card><TicketControls ticket={{ id: t.id, status: t.status, priority: t.priority, assigneeId: t.assignee?.id ?? null }} people={people} canEdit={canEdit} /></Card>
          <Card>
            <dl className="text-[13px]">
              {row("Customer", <Link href={`/customers/contacts/${t.contact.id}`} className="hover:text-accent">{t.contact.name}</Link>)}
              {row("Contact", t.contact.email ?? t.contact.phone ?? "—")}
              {row("Reply due", t.firstResponseAt ? `Replied ${formatDateTime(t.firstResponseAt)}` : t.firstResponseDueAt ? formatDateTime(t.firstResponseDueAt) : "—")}
              {row("Fix due", t.resolvedAt ? `Resolved ${formatDateTime(t.resolvedAt)}` : t.resolutionDueAt ? formatDateTime(t.resolutionDueAt) : "—")}
              {t.csat && row("Rating", `${t.csat.score}/5${t.csat.comment ? ` — “${t.csat.comment}”` : ""}`)}
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
