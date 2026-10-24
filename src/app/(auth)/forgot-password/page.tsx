import type { Metadata } from "next";
import { ForgotForm } from "@/components/account/forgot-form";
import { AuthFrame } from "../auth-frame";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <AuthFrame title="Reset your password" subtitle="We'll email you a link that works for one hour.">
      <ForgotForm />
    </AuthFrame>
  );
}
