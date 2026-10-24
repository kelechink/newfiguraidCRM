import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PoliciesAdmin, TemplatesAdmin } from "@/components/hr/contracts-admin";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listTemplates } from "@/server/modules/hr/contracts-service";
import { listPolicies } from "@/server/modules/hr/deductions-service";
import { listUnits } from "@/server/modules/shell/service";
import { PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Contracts & policies" };

export default async function ContractsPage() {
  const ctx = await requireCtx();
  const seeTemplates = can(ctx, "hr.contracts", "VIEW");
  const seePolicies = can(ctx, "hr.deductions", "VIEW");
  if (!seeTemplates && !seePolicies) notFound();
  const [templates, policies, units] = await Promise.all([seeTemplates ? listTemplates(ctx) : [], seePolicies ? listPolicies(ctx) : [], listUnits()]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Contracts & policies" description="The onboarding pack every joiner signs, and the lateness rules payroll applies." />
      {seeTemplates && <TemplatesAdmin templates={templates} canEdit={can(ctx, "hr.contracts", "EDIT")} />}
      {seePolicies && <PoliciesAdmin policies={policies} units={units.map((u) => ({ id: u.id, name: u.name }))} canEdit={can(ctx, "hr.deductions", "EDIT")} />}
    </div>
  );
}
