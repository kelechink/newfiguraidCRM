import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Roster } from "@/components/academy/academy";
import { formatDay, money } from "@/lib/format";
import { can } from "@/server/authz/context";
import { ForbiddenError, NotFoundError } from "@/server/authz/errors";
import { requireCtx } from "@/server/auth/session";
import { cohortRoster } from "@/server/modules/academy/service";
import { listContacts } from "@/server/modules/crm/contacts-service";
import { listUnits } from "@/server/modules/shell/service";
import { StatCard } from "@/ui/stat";

export const metadata: Metadata = { title: "Cohort" };

export default async function CohortPage({ params }: { params: Promise<{ cohortId: string }> }) {
  const ctx = await requireCtx();
  const h = await cohortRoster(ctx, (await params).cohortId).catch((e) => (e instanceof NotFoundError || e instanceof ForbiddenError ? null : Promise.reject(e)));
  if (!h) notFound();
  const academy = (await listUnits()).find((u) => u.code === "ACADEMY");
  const contacts = can(ctx, "crm.contacts", "VIEW") && academy ? (await listContacts(ctx, { unitId: academy.id })).rows.map((c) => ({ id: c.id, name: c.name })) : [];
  const completed = h.students.filter((s) => s.state === "COMPLETED").length;
  const due = h.students.filter((s) => s.state !== "WITHDRAWN").reduce((n, s) => n + (s.amountDue ?? 0), 0);
  return (
    <div className="flex flex-col gap-5">
      <Link href="/customers/academy" className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" /> Academy</Link>
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{h.name}</h1>
        <p className="text-[13px] text-ink-3">{h.course.title} · {formatDay(h.startDate)} – {formatDay(h.endDate)}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Students" value={`${h.students.filter((s) => s.state !== "WITHDRAWN").length}${h.capacity ? ` / ${h.capacity}` : ""}`} />
        <StatCard label="Completed" value={String(completed)} />
        <StatCard label="Fees due (after scholarships)" value={money(due, "NGN", { compact: true })} />
      </div>
      <Roster cohortId={h.id} students={h.students} contacts={contacts} canEdit={can(ctx, "academy", "EDIT")} canCertify={can(ctx, "academy.certificates", "CREATE")} />
    </div>
  );
}
