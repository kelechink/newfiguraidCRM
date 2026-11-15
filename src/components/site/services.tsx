"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useRef, useState } from "react";
import { SERVICES } from "./content";

/**
 * Desktop: one panel stays pinned while scrolling walks through the four service groups.
 * Phones, tablets and reduced motion: the same content as a plain stacked list.
 */
export function Services() {
  const track = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [active, setActive] = useState(0);
  const n = SERVICES.length;

  useEffect(() => {
    // pinned only where the whole panel fits on screen
    const mq = window.matchMedia("(min-width: 1024px) and (min-height: 760px) and (prefers-reduced-motion: no-preference)");
    let st: ScrollTrigger | null = null;
    const setup = () => {
      st?.kill();
      st = null;
      setPinned(mq.matches);
      if (!mq.matches) return;
      gsap.registerPlugin(ScrollTrigger);
      st = ScrollTrigger.create({
        trigger: track.current,
        start: "top top+=64",
        end: "bottom bottom",
        onUpdate: (self) => setActive(Math.min(n - 1, Math.floor(self.progress * n * 0.999))),
      });
    };
    setup();
    mq.addEventListener("change", setup);
    return () => {
      mq.removeEventListener("change", setup);
      st?.kill();
    };
  }, [n]);

  // jump to a chapter: scroll to its share of the pinned track
  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 64;
    const y = top + ((el.offsetHeight - window.innerHeight + 64) * (i + 0.5)) / n;
    if (window.__lenis) window.__lenis.scrollTo(y);
    else window.scrollTo({ top: y, behavior: "smooth" });
  };

  return (
    <section id="services" className="services on-light" data-tone="light" aria-labelledby="services-title" tabIndex={-1}>
      <div ref={track} style={pinned ? { height: `${n * 85 + 40}vh` } : undefined}>
        <div
          className="wrap section"
          style={
            pinned
              ? {
                  position: "sticky",
                  top: 64,
                  paddingBlock: "56px 0",
                  minHeight: "calc(100vh - 64px)",
                }
              : undefined
          }
        >
          <div className="section-head" data-reveal>
            <h2 id="services-title" className="t-h2">
              What we carry
            </h2>
            <p className="t-lead muted">Voice, messages, numbers and data, over one interconnect and one contract.</p>
          </div>

          {pinned && (
            <div className="chapter-tabs" role="tablist" aria-label="Services">
              {SERVICES.map((s, i) => (
                <button key={s.key} type="button" role="tab" aria-selected={active === i} aria-current={active === i} aria-controls={`svc-${s.key}`} onClick={() => go(i)}>
                  {s.name}
                </button>
              ))}
            </div>
          )}

          <div className={`services-pin ${pinned ? "is-pinned" : ""}`}>
            <div className="chapters">
              {SERVICES.map((s, i) => {
                const on = !pinned || active === i;
                return (
                  <article
                    key={s.key}
                    id={`svc-${s.key}`}
                    className="chapter"
                    data-active={on}
                    role={pinned ? "tabpanel" : undefined}
                    aria-hidden={pinned && !on}
                    style={
                      pinned
                        ? {
                            opacity: on ? 1 : 0,
                            transform: on ? "none" : `translateY(${i < active ? -18 : 18}px)`,
                            transition: "opacity .55s cubic-bezier(.22,1,.36,1), transform .55s cubic-bezier(.22,1,.36,1)",
                          }
                        : undefined
                    }
                  >
                    <div
                      style={{
                        display: "grid",
                        gap: 18,
                        alignContent: "start",
                      }}
                    >
                      <h3 className="chapter-name">{s.name}</h3>
                      <p className="t-lead muted chapter-line">{s.line}</p>
                    </div>
                    <ul className="offerings" data-count={s.offerings.length}>
                      {s.offerings.map((o) => (
                        <li key={o.name} className="offering">
                          <h4>{o.name}</h4>
                          <p className="muted" style={{ fontSize: 15.5, lineHeight: 1.5 }}>
                            {o.detail}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
