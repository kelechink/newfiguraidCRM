import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AcceptPolicy } from "@/components/account/accept-policy";
import { getCtx, pendingStaffPolicy } from "@/server/auth/session";
import { Markdown } from "@/ui/markdown";
import { AuthFrame } from "../auth-frame";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  const policy = await pendingStaffPolicy(ctx.userId);
  if (!policy) redirect("/");
  return (
    <AuthFrame wide title={`Welcome, ${ctx.name.split(" ")[0]}`} subtitle={`Before you start, please read and accept ${policy.title} (version ${policy.version}).`}>
      <div className="scrollbar-thin mt-6 max-h-[52vh] overflow-y-auto rounded-xl border border-line bg-surface p-5">
        <Markdown source={policy.body} />
      </div>
      <AcceptPolicy policyId={policy.id} />
    </AuthFrame>
  );
}
