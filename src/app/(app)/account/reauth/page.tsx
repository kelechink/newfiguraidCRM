import type { Metadata } from "next";
import { ReauthForm } from "@/components/account/reauth-form";
import { requireCtx } from "@/server/auth/session";

export const metadata: Metadata = { title: "Confirm it's you" };

export default async function ReauthPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const ctx = await requireCtx();
  const { next } = await searchParams;
  return (
    <div className="mx-auto mt-10 max-w-[380px]">
      <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Confirm it&rsquo;s you</h1>
      <p className="mt-1 text-[13px] text-ink-3">Finance and payroll actions need your password again if you haven&rsquo;t entered it in the last 15 minutes.</p>
      <ReauthForm has2fa={ctx.has2fa} next={next && next.startsWith("/") && !next.startsWith("//") ? next : "/"} />
    </div>
  );
}
