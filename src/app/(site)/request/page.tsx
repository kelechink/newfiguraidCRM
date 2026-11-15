import type { Metadata } from "next";
import { headers } from "next/headers";
import { RequestForm } from "@/components/site/request-form";

export const metadata: Metadata = { title: { absolute: "Request a service — Figuraid" } };

export default async function RequestPage({ searchParams }: { searchParams: Promise<{ intent?: string; service?: string }> }) {
  const sp = await searchParams;
  const sales = sp.intent === "sales";
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <section className="request on-light" data-tone="light" style={{ paddingBlock: "clamp(120px, 14vw, 180px) clamp(80px, 10vw, 140px)" }}>
      <div className="wrap request-grid">
        <div className="section-head" style={{ alignContent: "start", marginBottom: 0 }}>
          <h1 className="t-h2">{sales ? "Talk to sales." : "Request a service."}</h1>
          <p className="t-lead muted">
            {sales
              ? "Tell us a little about your traffic and someone from our telecom team will get in touch."
              : "Share the service, the destinations and your expected volume. We'll come back with rates and next steps."}
          </p>
        </div>
        <div className="form-card">
          <RequestForm preset={sp.service === "procurement" ? "Procurement" : undefined} turnstileSiteKey={process.env.TURNSTILE_SITE_KEY ?? null} nonce={nonce} />
        </div>
      </div>
    </section>
  );
}
