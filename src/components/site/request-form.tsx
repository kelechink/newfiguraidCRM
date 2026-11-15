"use client";

import Link from "next/link";
import Script from "next/script";
import { useRef, useState, useTransition } from "react";
import { requestServiceAction } from "@/server/modules/site/actions";
import { REQUESTABLE } from "./content";

type Errors = Partial<Record<"service" | "name" | "company" | "email", string>>;

export function RequestForm({ preset, turnstileSiteKey, nonce }: { preset?: string; turnstileSiteKey: string | null; nonce?: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const form = useRef<HTMLFormElement>(null);

  const check = (f: FormData): Errors => {
    const e: Errors = {};
    if (!f.get("service")) e.service = "Choose the service you need.";
    if (!String(f.get("name") ?? "").trim()) e.name = "Enter your full name.";
    if (!String(f.get("company") ?? "").trim()) e.company = "Enter your company name.";
    const email = String(f.get("email") ?? "").trim();
    if (!email) e.email = "Enter your work email.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter an email like name@company.com.";
    return e;
  };

  const submit = (f: FormData) => {
    const e = check(f);
    setErrors(e);
    setError(null);
    if (Object.keys(e).length) {
      form.current?.querySelector<HTMLElement>(`[name="${Object.keys(e)[0]}"]`)?.focus();
      return;
    }
    const q = new URLSearchParams(window.location.search);
    start(async () => {
      const r = await requestServiceAction({
        service: f.get("service"),
        destinations: f.get("destinations") ?? "",
        volume: f.get("volume") ?? "",
        name: f.get("name"),
        company: f.get("company"),
        email: f.get("email"),
        phone: f.get("phone") ?? "",
        message: f.get("message") ?? "",
        marketing: f.get("marketing") === "on",
        website: f.get("website") || undefined,
        turnstile: (f.get("cf-turnstile-response") as string | null) ?? null,
        utm: {
          source: q.get("utm_source") ?? undefined,
          medium: q.get("utm_medium") ?? undefined,
          campaign: q.get("utm_campaign") ?? undefined,
          content: q.get("utm_content") ?? undefined,
        },
      });
      if (r.ok) setDone(true);
      else setError(r.error);
    });
  };

  if (done) {
    return (
      <div className="form-done" role="status">
        <h3 className="t-h3">Request sent.</h3>
        <p className="muted">Our telecom team will reply with rates and next steps. We&apos;ve emailed you a copy of what you sent.</p>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setDone(false);
            form.current?.reset();
          }}
        >
          Send another request
        </button>
      </div>
    );
  }

  const err = (k: keyof Errors) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `${k}-error` } : {});
  return (
    <form ref={form} className="form-grid" noValidate action={submit} aria-describedby={error ? "form-error" : undefined}>
      <div className="field full">
        <label htmlFor="rq-service">Service</label>
        <select id="rq-service" name="service" defaultValue={preset && REQUESTABLE.includes(preset) ? preset : ""} required {...err("service")}>
          <option value="" disabled>
            Choose a service
          </option>
          {REQUESTABLE.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {errors.service && (
          <p id="service-error" className="error">
            {errors.service}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="rq-dest">Destinations</label>
        <input id="rq-dest" name="destinations" placeholder="e.g. Nigeria, Ghana, UK" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="rq-vol">Expected monthly volume</label>
        <input id="rq-vol" name="volume" placeholder="e.g. 2 million minutes" autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor="rq-name">Full name</label>
        <input id="rq-name" name="name" autoComplete="name" required {...err("name")} />
        {errors.name && (
          <p id="name-error" className="error">
            {errors.name}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="rq-company">Company</label>
        <input id="rq-company" name="company" autoComplete="organization" required {...err("company")} />
        {errors.company && (
          <p id="company-error" className="error">
            {errors.company}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="rq-email">Work email</label>
        <input id="rq-email" name="email" type="email" inputMode="email" autoComplete="email" required {...err("email")} />
        {errors.email && (
          <p id="email-error" className="error">
            {errors.email}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor="rq-phone">
          Phone <span className="hint">(optional)</span>
        </label>
        <input id="rq-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" />
      </div>
      <div className="field full">
        <label htmlFor="rq-msg">
          Anything else <span className="hint">(optional)</span>
        </label>
        <textarea id="rq-msg" name="message" rows={4} />
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1 }} />
      <label className="consent full">
        <input type="checkbox" name="marketing" />
        <span>Send me product updates and route offers by email. You can unsubscribe at any time.</span>
      </label>
      {turnstileSiteKey && (
        <div className="full">
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer nonce={nonce} />
          <div className="cf-turnstile" data-sitekey={turnstileSiteKey} />
        </div>
      )}
      {error && (
        <p id="form-error" className="form-status full" data-tone="error" role="alert">
          {error}
        </p>
      )}
      <div className="full" style={{ display: "grid", gap: 14, justifyItems: "start" }}>
        <button type="submit" className="btn btn-ink" disabled={pending}>
          {pending ? "Sending…" : "Send request"}
        </button>
        <p className="legal-note">
          By submitting, you agree to our <Link href="/terms">Terms and Conditions</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
    </form>
  );
}
