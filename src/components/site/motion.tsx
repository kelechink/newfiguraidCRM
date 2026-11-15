"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { useEffect } from "react";

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

/**
 * Smooth scrolling (Lenis) driving GSAP ScrollTrigger, plus one quiet reveal on section
 * headings. Nothing runs when the visitor prefers reduced motion: the page is fully
 * readable as plain HTML.
 */
export function SiteMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const root = document.documentElement;
    root.classList.add("js-motion");

    const lenis = new Lenis({ autoRaf: false, lerp: 0.11 });
    window.__lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const reveals = gsap.utils.toArray<HTMLElement>("[data-reveal]").map((el) =>
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: "power3.out",
        scrollTrigger: { trigger: el, start: "top 86%", once: true },
      }),
    );
    return () => {
      reveals.forEach((t) => t.kill());
      gsap.ticker.remove(tick);
      lenis.destroy();
      delete window.__lenis;
      root.classList.remove("js-motion");
    };
  }, []);
  return null;
}

/** Scroll to an in-page anchor through Lenis when it's running. */
export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  if (window.__lenis) window.__lenis.scrollTo(el, { offset: -64 });
  else
    el.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  el.focus({ preventScroll: true });
}
