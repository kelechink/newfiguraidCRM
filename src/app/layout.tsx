import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Figuraid OS", template: "%s · Figuraid OS" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafb" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f11" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get("fos_theme")?.value;
  return (
    <html lang="en-NG" data-theme={theme === "light" || theme === "dark" ? theme : undefined} className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
