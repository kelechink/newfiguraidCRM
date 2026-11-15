"use client";

import { useEffect, useRef, useState } from "react";
import { REGIONS, SERVICES, type RegionKey } from "./content";
import { WORLD_DOTS, WORLD_VIEWBOX } from "./world-dots";

const NAME = Object.fromEntries(SERVICES.map((s) => [s.key, s.name]));

export function Coverage() {
  const [region, setRegion] = useState<RegionKey>("africa");
  const [focus, setFocus] = useState(false);
  const videoBox = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playVideo, setPlayVideo] = useState(false);

  // the looping clip loads only near the viewport, plays only while visible, never under reduced motion
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = videoBox.current!;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e!.isIntersecting) {
          setPlayVideo(true);
          void video.current?.play().catch(() => undefined);
        } else video.current?.pause();
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const current = REGIONS.find((r) => r.key === region)!;
  return (
    <section id="coverage" className="coverage section" data-tone="dark" aria-labelledby="coverage-title" tabIndex={-1}>
      <div ref={videoBox} className="coverage-video" aria-hidden="true">
        {playVideo ? (
          <video ref={video} src="/site/coverage.mp4" poster="/site/coverage-poster.webp" muted loop playsInline autoPlay preload="none" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/site/coverage-poster.webp" alt="" loading="lazy" decoding="async" />
        )}
      </div>
      <div className="wrap on-dark">
        <div className="section-head" data-reveal>
          <h2 id="coverage-title" className="t-h2">
            Wherever your customers are.
          </h2>
          <p className="t-lead muted">Choose a region to see what you can buy there today. Ask us about any destination you don&apos;t see.</p>
        </div>

        <div className="coverage-grid">
          <div style={{ display: "grid", gap: 32, alignContent: "start" }}>
            <div className="regions" role="group" aria-label="Regions">
              {REGIONS.map((r) => (
                <button key={r.key} type="button" aria-pressed={region === r.key} onClick={() => setRegion(r.key)} onFocus={() => setRegion(r.key)}>
                  {r.name}
                </button>
              ))}
            </div>

            <div className="region-detail" aria-live="polite">
              <h3 className="t-h3">{current.name}</h3>
              <ul>
                {current.services.map((k) => (
                  <li key={k}>{NAME[k]}</li>
                ))}
              </ul>
            </div>
          </div>
          <svg className="map" viewBox={WORLD_VIEWBOX} data-focus={focus} role="img" aria-label={`World map with ${current.name} highlighted`} onMouseLeave={() => setFocus(false)}>
            {REGIONS.map((r) => (
              <path
                key={r.key}
                d={WORLD_DOTS[r.key]}
                data-on={r.key === region}
                onMouseEnter={() => {
                  setRegion(r.key);
                  setFocus(true);
                }}
                onClick={() => setRegion(r.key)}
              />
            ))}
          </svg>
        </div>
      </div>
    </section>
  );
}
