import type { Metadata } from "next";
import { SetPasswordForm } from "@/components/account/password-form";
import { peekToken } from "@/server/modules/account/service";
import { AuthFrame } from "../../auth-frame";

export const metadata: Metadata = { title: "Accept invite" };

export default async function AcceptInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const who = await peekToken(token, "INVITE");
  if (!who) return <AuthFrame title="This invite has expired" subtitle="Ask your manager or HR to send a new one." />;
  return (
    <AuthFrame title={`Welcome, ${who.name.split(" ")[0]}`} subtitle={`Set a password for ${who.email}.`}>
      <SetPasswordForm token={token} purpose="INVITE" />
    </AuthFrame>
  );
}
