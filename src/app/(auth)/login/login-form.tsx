"use client";

import { APP_HOME } from "@/lib/routes";

import { ShieldCheck } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";

function safeNext(next: string | null): string {
  // only same-site relative paths — never an open redirect
  return next && next.startsWith("/") && !next.startsWith("//") && next !== "/" ? next : APP_HOME;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState(false);
  const [pending, start] = useTransition();
  const creds = useRef<{ email: string; password: string }>({ email: "", password: "" });

  const attempt = (code?: string) =>
    start(async () => {
      setError(null);
      const res = await signIn("credentials", { ...creds.current, code, redirect: false });
      if (res?.ok) {
        router.replace(safeNext(params.get("next")));
        router.refresh();
      } else if (res?.error === "TOTP_REQUIRED") {
        setNeedCode(true);
      } else if (needCode || code) {
        setError("That code didn't work. Use the newest code from your authenticator app, or a recovery code.");
      } else {
        // One message for every failure — never reveal whether the email exists or is locked.
        setError("That email and password didn't match, or the account is temporarily locked. Try again in a few minutes.");
      }
    });

  if (needCode) {
    return (
      <form
        action={(f) => attempt(String(f.get("code") ?? ""))}
        className="mt-6 grid gap-4"
      >
        <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" />
          <p className="text-[12.5px] text-ink-2">Enter the 6-digit code from your authenticator app. Lost your phone? Use one of your recovery codes.</p>
        </div>
        <Field label="Authentication code" htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required autoFocus className="h-10 text-center text-[16px] tracking-[0.3em] tabular" maxLength={9} />
        </Field>
        {error && (
          <p role="alert" className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={pending} className="h-9">
          Verify and sign in
        </Button>
        <button type="button" onClick={() => setNeedCode(false)} className="text-[12.5px] text-ink-3 hover:text-ink">
          ← Use a different account
        </button>
      </form>
    );
  }

  return (
    <form
      action={(f) => {
        creds.current = { email: String(f.get("email") ?? ""), password: String(f.get("password") ?? "") };
        attempt();
      }}
      className="mt-6 grid gap-4"
    >
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus className="h-9" />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-9" />
      </Field>
      {error && (
        <p role="alert" className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={pending} className="h-9">
        Sign in
      </Button>
      <Link href="/forgot-password" className="justify-self-center text-[12.5px] text-ink-3 hover:text-ink">
        Forgot your password?
      </Link>
    </form>
  );
}
