import Link from "next/link";
import { COMPANY, OTHER_BUSINESSES, SERVICES } from "./content";
import { Wordmark } from "./wordmark";

export function SiteFooter() {
  return (
    <footer className="site-footer on-light">
      <div className="wrap">
        <div className="footer-cols">
          <div
            style={{
              display: "grid",
              gap: 14,
              alignContent: "start",
              color: "var(--ink)",
            }}
          >
            <Wordmark />
            <address
              style={{
                fontStyle: "normal",
                color: "var(--ink-2)",
                lineHeight: 1.6,
              }}
            >
              {COMPANY.address.map((l) => (
                <span key={l} style={{ display: "block" }}>
                  {l}
                </span>
              ))}
            </address>
          </div>
          <div>
            <h2>Services</h2>
            <ul>
              {SERVICES.map((s) => (
                <li key={s.key}>
                  <Link href={`/#svc-${s.key}`}>{s.name}</Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Company</h2>
            <ul>
              <li>
                <Link href="/#coverage">Coverage</Link>
              </li>
              <li>
                <Link href="/#industries">Industries</Link>
              </li>
              <li>
                <Link href="/request">Request a service</Link>
              </li>
              <li>
                <Link href="/request?intent=sales">Talk to sales</Link>
              </li>
              <li>
                <Link href="/login">Staff sign in</Link>
              </li>
            </ul>
          </div>
          <div>
            <h2>Our other businesses</h2>
            <ul className="biz">
              {OTHER_BUSINESSES.map((b) => (
                <li key={b.name}>
                  {b.href.startsWith("http") ? (
                    <a href={b.href} target="_blank" rel="noopener">
                      {b.name}
                    </a>
                  ) : (
                    <Link href={b.href}>{b.name}</Link>
                  )}
                  <span>{b.line}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Legal</h2>
            <ul>
              <li>
                <Link href="/terms">Terms and Conditions</Link>
              </li>
              <li>
                <Link href="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/privacy/request">Your data rights</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-base">
          <p>
            Copyright © {new Date().getFullYear()} {COMPANY.name}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
