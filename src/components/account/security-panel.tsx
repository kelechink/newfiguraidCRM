"use client";

import { APP_HOME } from "@/lib/routes";
import { Copy, Laptop, LogOut, ShieldAlert, ShieldCheck, Smartphone } from "lucide-react";
import { useState } from "react";
import { ago } from "@/lib/format";
import {
  changePasswordAction,
  confirmTotpAction,
  disableTotpAction,
  revokeSessionAction,
  signOutEverywhereAction,
  startTotpAction,
} from "@/server/modules/account/actions";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Card, CardHeader } from "@/ui/card";
import { ConfirmButton } from "@/ui/confirm";
import { Field, Input } from "@/ui/field";
import { useAction } from "@/ui/use-action";

interface SessionRow {
  id: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

function deviceName(ua: string | null): string {
  if (!ua) return "Unknown device";
  const os = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox\//.test(ua) ? "Firefox" : "Browser";
  return `${browser} on ${os}`;
}

function TwoFactor({ has2fa, required, mustEnroll }: { has2fa: boolean; required: boolean; mustEnroll: boolean }) {
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const start = useAction(startTotpAction, { refresh: false, onSuccess: setSetup });
  const confirm = useAction(confirmTotpAction, { refresh: false, success: "Two-factor sign-in is on", onSuccess: (r) => setCodes(r.recoveryCodes) });
  const disable = useAction(disableTotpAction, { success: "Two-factor sign-in turned off" });

  if (codes) {
    return (
      <Card>
        <CardHeader title="Save your recovery codes" description="Each code works once if you lose your phone. Store them somewhere safe — they won't be shown again." />
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-surface-2/50 p-4 font-mono text-[13px] sm:grid-cols-5">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(codes.join("\n"))}>
            <Copy className="size-3.5" /> Copy
          </Button>
          <Button variant="primary" onClick={() => window.location.assign(APP_HOME)}>
            I've saved them
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Two-factor sign-in"
        description="A 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password) every time you sign in."
        actions={has2fa ? <Badge tone="success" icon={<ShieldCheck className="size-3" />}>On</Badge> : <Badge tone={required ? "danger" : "warning"}>Off</Badge>}
      />
      {mustEnroll && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 p-3 text-[12.5px] text-ink-2">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          Your role handles sensitive data, so two-factor sign-in is required before you can continue.
        </div>
      )}
      {has2fa ? (
        required ? (
          <p className="text-[12.5px] text-ink-3">Required for your role.</p>
        ) : (
          <form className="flex flex-wrap items-end gap-2" action={disable.formAction((f) => ({ password: f.get("password") }))}>
            <Field label="Confirm password to turn off" htmlFor="pw-off">
              <Input id="pw-off" name="password" type="password" required className="w-60" />
            </Field>
            <Button type="submit" variant="secondary" loading={disable.pending}>
              Turn off
            </Button>
          </form>
        )
      ) : setup ? (
        <div className="grid gap-5 sm:grid-cols-[220px_1fr]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="QR code for your authenticator app" width={220} height={220} className="rounded-lg border border-line bg-white p-2" />
          <div className="grid content-start gap-3 text-[13px]">
            <ol className="list-decimal space-y-1 pl-5 text-ink-2">
              <li>Open your authenticator app and scan the code.</li>
              <li>Can't scan? Enter this key: <code className="break-all rounded bg-surface-2 px-1 font-mono text-[12px]">{setup.secret}</code></li>
              <li>Type the 6-digit code it shows.</li>
            </ol>
            <form className="flex flex-wrap items-end gap-2" action={confirm.formAction((f) => ({ code: f.get("code") }))}>
              <Field label="Code" htmlFor="totp" error={confirm.errors.code}>
                <Input id="totp" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="w-32 text-center tracking-[0.25em] tabular" />
              </Field>
              <Button type="submit" variant="primary" loading={confirm.pending}>
                Turn on
              </Button>
            </form>
          </div>
        </div>
      ) : (
        <Button variant="primary" onClick={() => start.run(undefined as never)} loading={start.pending}>
          <ShieldCheck className="size-3.5" /> Set up two-factor sign-in
        </Button>
      )}
    </Card>
  );
}

export function SecurityPanel({ has2fa, required, mustEnroll, sessions }: { has2fa: boolean; required: boolean; mustEnroll: boolean; sessions: SessionRow[] }) {
  const pw = useAction(changePasswordAction, { success: "Password changed. Other devices were signed out." });
  const revoke = useAction(revokeSessionAction, { success: "Device signed out" });
  const everywhere = useAction(signOutEverywhereAction, { refresh: false, onSuccess: () => window.location.assign("/login") });

  return (
    <>
      <TwoFactor has2fa={has2fa} required={required} mustEnroll={mustEnroll} />

      <Card>
        <CardHeader title="Password" description="At least 12 characters. Changing it signs out your other devices." />
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          action={pw.formAction((f) => ({ current: f.get("current"), next: f.get("next") }))}
        >
          <Field label="Current password" htmlFor="pw-cur">
            <Input id="pw-cur" name="current" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="New password" htmlFor="pw-new">
            <Input id="pw-new" name="next" type="password" autoComplete="new-password" required minLength={12} />
          </Field>
          <Button type="submit" variant="secondary" loading={pw.pending}>
            Change password
          </Button>
        </form>
      </Card>

      <Card padded={false}>
        <div className="p-4 pb-0 sm:p-5 sm:pb-0">
          <CardHeader
            title="Signed-in devices"
            description="Sessions end after 8 hours, or 30 minutes of inactivity."
            actions={
              <ConfirmButton
                title="Sign out everywhere?"
                body="Every device, including this one, will be signed out immediately."
                confirmLabel="Sign out everywhere"
                danger
                onConfirm={() => everywhere.run(undefined as never)}
              >
                <Button size="sm" variant="secondary">
                  <LogOut className="size-3.5" /> Sign out everywhere
                </Button>
              </ConfirmButton>
            }
          />
        </div>
        <ul className="divide-y divide-line">
          {sessions.map((s) => {
            const mobile = /iPhone|Android/.test(s.userAgent ?? "");
            const Icon = mobile ? Smartphone : Laptop;
            return (
              <li key={s.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Icon className="size-4 text-ink-3" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">
                    {deviceName(s.userAgent)} {s.current && <Badge tone="accent" className="ml-1">This device</Badge>}
                  </p>
                  <p className="text-2xs text-ink-3">
                    {s.ip ?? "Unknown IP"} · active {ago(s.lastSeenAt)}
                  </p>
                </div>
                {!s.current && (
                  <Button size="sm" variant="ghost" onClick={() => revoke.run(s.id)} disabled={revoke.pending}>
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
