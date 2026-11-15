import { headers } from "next/headers";
import { Coverage } from "@/components/site/coverage";
import { COMPANY, INSIGHTS } from "@/components/site/content";
import { Hero } from "@/components/site/hero";
import { Industries } from "@/components/site/industries";
import { RequestForm } from "@/components/site/request-form";
import { Services } from "@/components/site/services";

export default async function HomePage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <>
      <link rel="preload" as="image" href="/site/hero/d/001.webp" media="(min-width: 768px)" fetchPriority="high" />
      <link rel="preload" as="image" href="/site/hero/m/001.webp" media="(max-width: 767px)" fetchPriority="high" />
      <Hero />
      <Services />
      <Coverage />
      <Industries />

      <section id="request" className="request section on-light" data-tone="light" aria-labelledby="request-title" tabIndex={-1}>
        <div className="wrap request-grid">
          <div className="section-head" data-reveal style={{ alignContent: "start", marginBottom: 0 }}>
            <h2 id="request-title" className="t-h2">
              Tell us what you need.
            </h2>
            <p className="t-lead muted">Share the service, the destinations and your expected volume. Our telecom team will come back to you with rates and next steps.</p>
            <address className="muted" style={{ fontStyle: "normal", marginTop: 16, lineHeight: 1.6 }}>
              <span style={{ display: "block", color: "var(--ink)", fontWeight: 560 }}>Figuraid Ltd</span>
              {COMPANY.address.map((l) => (
                <span key={l} style={{ display: "block" }}>
                  {l}
                </span>
              ))}
            </address>
          </div>
          <div className="form-card">
            <RequestForm turnstileSiteKey={process.env.TURNSTILE_SITE_KEY ?? null} nonce={nonce} />
          </div>
        </div>
      </section>

      {INSIGHTS.length > 0 && (
        <section id="insights" className="section on-light" data-tone="light" aria-labelledby="insights-title">
          <div className="wrap">
            <div className="section-head" data-reveal>
              <h2 id="insights-title" className="t-h2">
                Insights and news
              </h2>
            </div>
            <ul className="insights-grid">
              {INSIGHTS.map((p) => (
                <li key={p.href}>
                  <a href={p.href} className="t-h3">
                    {p.title}
                  </a>
                  <p className="muted t-small">{p.date}</p>
                  <p className="muted">{p.summary}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
