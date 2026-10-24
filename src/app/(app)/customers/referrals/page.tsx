import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Referrals } from "@/components/growth/referrals";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listPayouts, listReferrers } from "@/server/modules/growth/referrals-service";
import { PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Referrals" };

export default async function ReferralsPage() {
  const ctx = await requireCtx();
  if (!can(ctx, "referrals", "VIEW")) notFound();
  const [referrers, payouts] = await Promise.all([listReferrers(ctx), listPayouts(ctx)]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Referrals" description="Customers, graduates and partners who send us business, and what we owe them." />
      <Referrals referrers={referrers} payouts={payouts} can={{ create: can(ctx, "referrals", "CREATE"), request: can(ctx, "referrals", "EDIT"), approve: can(ctx, "referrals.payouts", "APPROVE") }} />
    </div>
  );
}
