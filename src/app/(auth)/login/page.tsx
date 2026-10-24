import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getCtx } from "@/server/auth/session";
import { AuthFrame } from "../auth-frame";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCtx()) redirect("/");
  return (
    <AuthFrame title="Sign in" subtitle="Use your Figuraid work email.">
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}
