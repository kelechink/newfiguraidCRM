"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { completePasswordAction } from "@/server/modules/account/actions";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";

export function SetPasswordForm({ token, purpose }: { token: string; purpose: "INVITE" | "PASSWORD_RESET" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-6 grid gap-4"
      action={(f) =>
        start(async () => {
          const password = String(f.get("password") ?? "");
          if (password !== f.get("confirm")) return setError("The two passwords don't match.");
          const res = await completePasswordAction({ token, purpose, password });
          if (res.ok) router.replace("/login?set=1");
          else setError(res.error);
        })
      }
    >
      <Field label="New password" htmlFor="password" hint="At least 12 characters. A short sentence is strong and easy to remember.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} className="h-9" autoFocus />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="h-9" />
      </Field>
      {error && (
        <p role="alert" className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" loading={pending} className="h-9">
        Set password
      </Button>
    </form>
  );
}
