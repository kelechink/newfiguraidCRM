import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TenderBoard } from "@/components/growth/tenders";
import { can, scopeOf } from "@/server/authz/context";
import { NotFoundError } from "@/server/authz/errors";
import { requireCtx } from "@/server/auth/session";
import { getTender, listTenders } from "@/server/modules/growth/tenders-service";
import { listUnits } from "@/server/modules/shell/service";
import { PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Tenders" };

export default async function TendersPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const ctx = await requireCtx();
  if (!can(ctx, "tenders", "VIEW")) notFound();
  const t = (await searchParams).t;
  const [tenders, units, detail] = await Promise.all([listTenders(ctx), listUnits(), t ? getTender(ctx, t).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e))) : Promise.resolve(null)]);
  const scope = scopeOf(ctx, "tenders", "CREATE");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Tenders & bids" description="Government and enterprise opportunities from first contact to award, with document readiness and deadline alerts." />
      <TenderBoard tenders={tenders} detail={detail ? { id: detail.id, title: detail.title, agency: detail.agency, stage: detail.stage, outcomeNote: detail.outcomeNote, checklist: detail.checklist } : null} units={units.filter((u) => scope === "ALL" || ctx.unitIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }))} canEdit={can(ctx, "tenders", "EDIT")} />
    </div>
  );
}
