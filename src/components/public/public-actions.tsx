"use client";

import Script from "next/script";
import { useState, useTransition } from "react";
import { csatAction, dsrAction, signExternalAction } from "@/server/modules/growth/public-actions";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Field, Input, Select, Textarea } from "@/ui/field";

function Done({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-success/30 bg-success/5 px-4 py-4 text-[13.5px]" role="status">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-ink-2">{body}</p>
    </div>
  );
}

export function ExternalSignForm({ token, signerName }: { token: string; signerName: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [agree, setAgree] = useState(false);
  if (done) return <Done title="Signed — thank you" body="Figuraid has been notified. You can close this page." />;
  return (
    <form
      className="grid gap-4"
      action={(f) =>
        start(async () => {
          const r = await signExternalAction({ token, typedName: f.get("typed"), agree: agree || undefined });
          if (r.ok) setDone(true);
          else setError(r.error);
        })
      }
    >
      <Field label="Type your full name to sign" htmlFor="x-name" hint={`As addressed: ${signerName}`}><Input id="x-name" name="typed" required autoComplete="name" className="h-10" /></Field>
      <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 accent-[hsl(var(--accent))]" /> I have read the document and agree to sign it electronically. My name, the time, my IP address and device are recorded.</label>
      {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
      <Button type="submit" variant="primary" disabled={!agree} loading={pending} className="h-10">Sign</Button>
    </form>
  );
}

export function CsatForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (done) return <Done title="Thank you" body="Your rating helps us improve." />;
  const labels = ["Very poor", "Poor", "OK", "Good", "Excellent"];
  return (
    <form
      className="grid gap-4"
      action={(f) =>
        start(async () => {
          if (!score) return setError("Choose a rating");
          const r = await csatAction({ token, score, comment: f.get("comment") || undefined });
          if (r.ok) setDone(true);
          else setError(r.error);
        })
      }
    >
      <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Rating">
        {labels.map((l, i) => (
          <button key={l} type="button" role="radio" aria-checked={score === i + 1} onClick={() => setScore(i + 1)} className={cn("grid h-16 place-items-center rounded-lg border text-[12px]", score === i + 1 ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:border-line-strong")}>
            <span className="text-[18px] font-semibold">{i + 1}</span>{l}
          </button>
        ))}
      </div>
      <Field label="Anything to add? (optional)" htmlFor="cs-c"><Textarea id="cs-c" name="comment" rows={3} maxLength={1000} /></Field>
      {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
      <Button type="submit" variant="primary" loading={pending} className="h-10">Send rating</Button>
    </form>
  );
}

export function DsrForm({ turnstileSiteKey, nonce }: { turnstileSiteKey: string | null; nonce?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ref, setRef] = useState<string | null>(null);
  if (ref) return <Done title="Request received" body={`Your reference is ${ref}. We'll contact you to verify your identity, then respond within the legal deadline.`} />;
  return (
    <form
      className="grid gap-4"
      action={(f) =>
        start(async () => {
          const r = await dsrAction({ type: f.get("type"), name: f.get("name"), email: f.get("email") || "", phone: f.get("phone") || undefined, details: f.get("details") || undefined, website: f.get("website") || undefined, turnstile: (f.get("cf-turnstile-response") as string | null) ?? null });
          if (r.ok) setRef((r.data as { reference: string } | undefined)?.reference ?? "RECEIVED");
          else setError(r.error);
        })
      }
    >
      <Field label="What would you like us to do?" htmlFor="d-type">
        <Select id="d-type" name="type" className="h-10">
          <option value="ACCESS">Give me a copy of my data</option>
          <option value="CORRECTION">Correct my data</option>
          <option value="DELETION">Delete my data</option>
          <option value="OBJECTION">Stop using my data for marketing</option>
          <option value="PORTABILITY">Send my data in a portable format</option>
          <option value="RESTRICTION">Restrict how my data is used</option>
        </Select>
      </Field>
      <Field label="Full name" htmlFor="d-name"><Input id="d-name" name="name" required className="h-10" autoComplete="name" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="d-email"><Input id="d-email" name="email" type="email" className="h-10" autoComplete="email" /></Field>
        <Field label="Phone" htmlFor="d-phone"><Input id="d-phone" name="phone" type="tel" className="h-10" autoComplete="tel" /></Field>
      </div>
      <Field label="Details (optional)" htmlFor="d-det" hint="Which service you used, and anything that helps us find your records."><Textarea id="d-det" name="details" rows={3} maxLength={3000} /></Field>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      {turnstileSiteKey && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer nonce={nonce} />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        </>
      )}
      {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
      <Button type="submit" variant="primary" loading={pending} className="h-10">Send request</Button>
    </form>
  );
}
