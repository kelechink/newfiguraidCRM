import type { Metadata } from "next";
import { SecurityPanel } from "@/components/account/security-panel";
import { requireCtx } from "@/server/auth/session";
import { listSessions } from "@/server/modules/account/service";
import { PageHeader } from "@/ui/page-header";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ enroll?: string }> }) {
  const ctx = await requireCtx();
  const { enroll } = await searchParams;
  const sessions = await listSessions(ctx);
  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-6">
      <PageHeader title="Account security" description="Two-factor sign-in, password and the devices signed in to your account." />
      <SecurityPanel has2fa={ctx.has2fa} required={ctx.requires2fa} mustEnroll={!!enroll && !ctx.has2fa} sessions={sessions} />
    </div>
  );
}
