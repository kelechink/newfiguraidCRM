import "lenis/dist/lenis.css";
import "./site.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { SiteMotion } from "@/components/site/motion";

// Inter with its optical-size axis: the display cut at headline sizes, text cut for reading.
const site = Inter({ subsets: ["latin"], axes: ["opsz"], variable: "--font-site", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://figuraid.com"),
  title: { absolute: "Figuraid — Global wholesale telecom" },
  description: "Wholesale voice, messaging, numbers and connectivity for carriers and businesses everywhere.",
  robots: { index: true, follow: true },
  openGraph: {
    title: "Figuraid — The world, connected.",
    description: "Wholesale voice, messaging, numbers and connectivity for carriers and businesses everywhere.",
    type: "website",
    images: ["/site/hero/d/127.webp"],
  },
};

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`site ${site.variable}`}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
      <SiteMotion />
    </div>
  );
}
