"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "./wordmark";

const LINKS = [
  { href: "/#services", label: "Services" },
  { href: "/#coverage", label: "Coverage" },
  { href: "/#industries", label: "Industries" },
  { href: "/#request", label: "Request a service" },
];

/** Transparent over dark sections, frosted glass over light ones. */
export function SiteHeader() {
  const [tone, setTone] = useState<"dark" | "light">("dark");
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-tone]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setTone((e.target as HTMLElement).dataset.tone === "light" ? "light" : "dark");
      },
      { rootMargin: "-32px 0px -94% 0px" },
    );
    sections.forEach((s) => io.observe(s));
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="site-header" data-tone={open ? "dark" : tone} data-scrolled={scrolled || open}>
        <div className="wrap bar">
          <Link href="/" aria-label="Figuraid home" onClick={() => setOpen(false)}>
            <Wordmark />
          </Link>
          <nav className="site-nav" aria-label="Main">
            {LINKS.slice(0, 3).map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <Link href="/login" className="signin">
              Staff sign in
            </Link>
            <Link href="/request?intent=sales" className={`btn ${tone === "light" && !open ? "btn-ink" : "btn-signal"}`}>
              Talk to sales
            </Link>
            <button type="button" className="menu-btn" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((o) => !o)}>
              {open ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
            </button>
          </div>
        </div>
      </header>
      {open && (
        <nav id="mobile-menu" className="mobile-menu" aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            style={{
              fontSize: 17,
              fontWeight: 500,
              opacity: 0.7,
              marginTop: 24,
            }}
          >
            Staff sign in
          </Link>
        </nav>
      )}
    </>
  );
}
