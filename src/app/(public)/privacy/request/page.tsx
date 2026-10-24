import type { Metadata } from "next";
import { headers } from "next/headers";
import { DsrForm } from "@/components/public/public-actions";
import { getSetting } from "@/server/modules/settings/service";
import { PublicShell } from "../../public-shell";

export const metadata: Metadata = { title: "Data request" };

export default async function DsrPage() {
  const [days, nonce] = await Promise.all([getSetting("privacy.dsr_days"), headers().then((h) => h.get("x-nonce") ?? undefined)]);
  return (
    <PublicShell title="Request about your data">
      <p className="mb-5 text-[13.5px] text-ink-2">We'll verify it's you before sharing or changing anything, and respond within {days} days.</p>
      <DsrForm turnstileSiteKey={process.env.TURNSTILE_SITE_KEY ?? null} nonce={nonce} />
    </PublicShell>
  );
}
