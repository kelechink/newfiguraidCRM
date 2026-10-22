import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCtx } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCtx()) redirect("/work/tasks");
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-white shadow-[inset_0_1px_0_hsl(0_0%_100%/0.2)]">F</span>
          <span className="text-[16px] font-semibold tracking-[-0.01em]">Figuraid OS</span>
        </div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em]">Sign in</h1>
        <p className="mt-1 text-[13px] text-ink-3">Use your Figuraid work email.</p>
        <LoginForm />
        <p className="mt-8 text-2xs leading-4 text-ink-3">
          By signing in you agree to Figuraid&rsquo;s staff privacy policy and acceptable use of company systems.
        </p>
      </div>
    </main>
  );
}
