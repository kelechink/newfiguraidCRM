"use client";

import { reauthAction } from "@/server/modules/account/actions";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/field";
import { useAction } from "@/ui/use-action";

export function ReauthForm({ has2fa, next }: { has2fa: boolean; next: string }) {
  const { formAction, pending } = useAction(reauthAction, { refresh: false, onSuccess: () => window.location.assign(next) });
  return (
    <form className="mt-6 grid gap-4" action={formAction((f) => ({ password: f.get("password"), code: f.get("code") || undefined }))}>
      <Field label="Password" htmlFor="pw">
        <Input id="pw" name="password" type="password" autoComplete="current-password" required autoFocus />
      </Field>
      {has2fa && (
        <Field label="Authenticator code" htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="tracking-[0.25em] tabular" />
        </Field>
      )}
      <Button type="submit" variant="primary" loading={pending}>
        Continue
      </Button>
    </form>
  );
}
