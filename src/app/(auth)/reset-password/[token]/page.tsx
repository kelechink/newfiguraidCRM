import type { Metadata } from "next";
import { SetPasswordForm } from "@/components/account/password-form";
import { peekToken } from "@/server/modules/account/service";
import { AuthFrame } from "../../auth-frame";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const who = await peekToken(token, "PASSWORD_RESET");
  if (!who) return <AuthFrame title="This link has expired" subtitle="Reset links work for one hour and only once. Request a new one from the sign-in page." />;
  return (
    <AuthFrame title="Choose a new password" subtitle={who.email}>
      <SetPasswordForm token={token} purpose="PASSWORD_RESET" />
    </AuthFrame>
  );
}
