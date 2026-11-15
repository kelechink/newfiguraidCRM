"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

// Scroll scrubs through the rendered globe sequence: Earth's horizon at night resolves
// into a planet wrapped in glowing routes. Desktop: 127 frames at 1120w. Phones: 64 frames
// at 720w. Reduced motion: the final frame, still.
const SETS = {
  desktop: { count: 127, dir: "d" },
  mobile: { count: 64, dir: "m" },
} as const;
const src = (dir: string, i: number) => `/site/hero/${dir}/${String(i + 1).padStart(3, "0")}.webp`;

export function Hero() {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const coda = useRef<HTMLDivElement>(null);
  const cue = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"pending" | "scrub" | "still">("pending");

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setMode("still");
      return;
    }
    setMode("scrub");
    gsap.registerPlugin(ScrollTrigger);
    const set = window.matchMedia("(max-width: 767px)").matches ? SETS.mobile : SETS.desktop;
    const frames: (HTMLImageElement | null)[] = Array.from({ length: set.count }, () => null);
    const cvs = canvas.current!;
    const ctx = cvs.getContext("2d", { alpha: false })!;
    let current = 0;
    let drawn = -1;
    let raf = 0;

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cvs.width = Math.round(cvs.clientWidth * dpr);
      cvs.height = Math.round(cvs.clientHeight * dpr);
      drawn = -1;
      paint();
    };
    // nearest frame that has loaded, so early scrolling never shows a blank
    const nearest = (i: number) => {
      for (let d = 0; d < set.count; d++) {
        if (frames[i - d]) return frames[i - d]!;
        if (frames[i + d]) return frames[i + d]!;
      }
      return null;
    };
    const paint = () => {
      raf = 0;
      const img = nearest(current);
      if (!img || (drawn === current && img === frames[current])) return;
      const { width: W, height: H } = cvs;
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const w = img.naturalWidth * s;
      const h = img.naturalHeight * s;
      ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
      drawn = frames[current] ? current : -1;
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };

    const load = (i: number) =>
      new Promise<void>((resolve) => {
        if (frames[i]) return resolve();
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          frames[i] = img;
          if (Math.abs(i - current) < 3) request();
          resolve();
        };
        img.onerror = () => resolve();
        img.src = src(set.dir, i);
      });

    // first frame now; then a coarse pass (every 8th) so scrubbing works early; then fill in
    let cancelled = false;
    (async () => {
      await load(0);
      fit();
      const order = [...Array.from({ length: set.count }, (_, i) => i).filter((i) => i % 8 === 0), ...Array.from({ length: set.count }, (_, i) => i).filter((i) => i % 8 !== 0)];
      const queue = order.slice();
      const worker = async () => {
        while (queue.length && !cancelled) await load(queue.shift()!);
      };
      await Promise.all([worker(), worker(), worker(), worker()]);
    })();

    const st = ScrollTrigger.create({
      trigger: section.current,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => {
        const next = Math.min(set.count - 1, Math.round(self.progress * (set.count - 1)));
        if (next !== current) {
          current = next;
          request();
        }
      },
    });

    // the copy hands over to the globe, then a closing line arrives as the routes complete
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section.current,
        start: "top top",
        end: "bottom bottom",
        scrub: 0.6,
      },
    });
    tl.to(cue.current, { opacity: 0, duration: 0.05 }, 0)
      .to(copy.current, { opacity: 0, y: -48, duration: 0.18, ease: "power1.in" }, 0.22)
      .fromTo(coda.current, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.16, ease: "power2.out" }, 0.74)
      .to({}, { duration: 0.1 });

    // the single orchestrated moment on arrival
    const intro = gsap.from(copy.current!.children, {
      opacity: 0,
      y: 26,
      duration: 1.2,
      ease: "power3.out",
      stagger: 0.09,
      delay: 0.15,
    });

    window.addEventListener("resize", fit);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", fit);
      if (raf) cancelAnimationFrame(raf);
      st.kill();
      tl.scrollTrigger?.kill();
      tl.kill();
      intro.kill();
    };
  }, []);

  return (
    <section ref={section} className="hero" data-tone="dark" aria-labelledby="hero-title" data-mode={mode}>
      <div className="hero-sticky">
        <div className="hero-media" aria-hidden="true">
          {/* first frame as a real image so the page paints instantly; the canvas takes over once ready */}
          <picture style={{ opacity: mode === "scrub" ? 0 : 1 }}>
            <source media="(max-width: 767px)" srcSet={mode === "still" ? src("m", 63) : src("m", 0)} />
            <img src={mode === "still" ? src("d", 126) : src("d", 0)} alt="" width={1120} height={630} fetchPriority="high" decoding="async" />
          </picture>
          <canvas ref={canvas} style={{ opacity: mode === "scrub" ? 1 : 0 }} />
          <div className="hero-shade" />
        </div>

        <div ref={copy} className="hero-copy wrap">
          <h1 id="hero-title" className="t-display">
            The world, connected.
          </h1>
          <p className="t-lead">Wholesale voice, messaging, numbers and connectivity for carriers and businesses everywhere.</p>
          <div className="hero-actions">
            <Link href="/#request" className="btn btn-signal">
              Request a service
            </Link>
            <Link href="/request?intent=sales" className="btn btn-ghost-dark">
              Talk to sales
            </Link>
          </div>
        </div>

        <div ref={coda} className="hero-coda wrap" aria-hidden="true">
          <p>Global wholesale telecom, from Abuja to the world.</p>
        </div>
        <div ref={cue} className="scroll-cue" aria-hidden="true" />
      </div>
    </section>
  );
}
