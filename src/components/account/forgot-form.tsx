"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestResetAction } from "@/server/modules/account/actions";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";

export function ForgotForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (sent) {
    return (
      <div className="mt-6 grid gap-4">
        <p className="rounded-lg border border-line bg-surface p-3 text-[13px] text-ink-2">If that email belongs to a Figuraid OS account, a reset link is on its way.</p>
        <Link href="/login" className="text-[12.5px] text-accent hover:underline">← Back to sign in</Link>
      </div>
    );
  }
  return (
    <form
      className="mt-6 grid gap-4"
      action={(f) =>
        start(async () => {
          const res = await requestResetAction(String(f.get("email") ?? ""));
          if (res.ok) setSent(true);
          else setError(res.error);
        })
      }
    >
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" required autoFocus className="h-9" />
      </Field>
      {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
      <Button type="submit" variant="primary" loading={pending} className="h-9">
        Send reset link
      </Button>
      <Link href="/login" className="justify-self-center text-[12.5px] text-ink-3 hover:text-ink">Back to sign in</Link>
    </form>
  );
}
