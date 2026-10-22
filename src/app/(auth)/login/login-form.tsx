"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (form: FormData) =>
    start(async () => {
      setError(null);
      const res = await signIn("credentials", { email: form.get("email"), password: form.get("password"), redirect: false });
      if (res?.ok) {
        router.replace("/work/tasks");
        router.refresh();
      } else {
        // One message for every failure — never reveal whether the email exists or is locked.
        setError("That email and password didn't match, or the account is temporarily locked. Try again in a few minutes.");
      }
    });

  return (
    <form action={submit} className="mt-6 grid gap-4">
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
    </form>
  );
}
