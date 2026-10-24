"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import Script from "next/script";
import { useState, useTransition } from "react";
import { submitFormAction } from "@/server/modules/crm/public-actions";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/field";

type FieldDef = { key: string; label: string; type: string; required: boolean; options?: string[] };

export function PublicForm({
  form,
  utm,
  refCode,
  turnstileSiteKey,
  nonce,
}: {
  form: { slug: string; fields: FieldDef[]; consentText: string | null };
  utm: Record<string, string | undefined>;
  refCode: string | null;
  turnstileSiteKey: string | null;
  nonce?: string;
}) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <div className="mt-8 rounded-xl border border-line bg-surface p-6 text-center shadow-card">
        <CheckCircle2 className="mx-auto size-8 text-success" />
        <p className="mt-3 text-[15px] font-semibold">Thank you — we&rsquo;ve got it.</p>
        <p className="mt-1 text-[13px] text-ink-3">Someone from our team will reach out shortly.</p>
      </div>
    );
  }

  return (
    <form
      className="mt-6 grid gap-4 rounded-xl border border-line bg-surface p-5 shadow-card"
      action={(f) =>
        start(async () => {
          setError(null);
          const values = Object.fromEntries(form.fields.map((x) => [x.key, String(f.get(x.key) ?? "")]));
          const res = await submitFormAction({
            slug: form.slug,
            values,
            consent: f.get("consent") === "on",
            utm,
            ref: refCode,
            turnstile: (f.get("cf-turnstile-response") as string | null) ?? null,
            website: String(f.get("website") ?? ""),
          });
          if (res.ok) setDone(true);
          else setError(res.error);
        })
      }
    >
      {form.fields.map((x) => (
        <Field key={x.key} label={`${x.label}${x.required ? "" : " (optional)"}`} htmlFor={`f-${x.key}`}>
          {x.type === "textarea" ? (
            <Textarea id={`f-${x.key}`} name={x.key} required={x.required} maxLength={4000} />
          ) : x.type === "select" ? (
            <Select id={`f-${x.key}`} name={x.key} required={x.required} defaultValue="">
              <option value="" disabled>Choose…</option>
              {x.options?.map((o) => <option key={o}>{o}</option>)}
            </Select>
          ) : (
            <Input id={`f-${x.key}`} name={x.key} required={x.required} type={x.type === "phone" ? "tel" : x.type === "number" ? "number" : x.type === "email" ? "email" : "text"} autoComplete={x.type === "email" ? "email" : x.type === "phone" ? "tel" : x.key.includes("name") ? "name" : "off"} className="h-9" />
          )}
        </Field>
      ))}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {form.consentText && (
        <label className="flex items-start gap-2 text-[12.5px] text-ink-2">
          <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-[hsl(var(--accent))]" />
          {form.consentText}
        </label>
      )}
      {turnstileSiteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer nonce={nonce} />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        </>
      )}
      {error && <p role="alert" className="rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-[12.5px] text-danger">{error}</p>}
      <Button type="submit" variant="primary" loading={pending} className="h-10">Send</Button>
      <p className="text-2xs leading-4 text-ink-3">
        We use your details only to respond and, if you agree above, to send updates. See our <Link href="/privacy/forms" className="underline">privacy notice</Link>.
      </p>
    </form>
  );
}
