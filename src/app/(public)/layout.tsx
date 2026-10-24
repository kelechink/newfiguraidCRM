import type { ReactNode } from "react";

/** Public pages (forms, certificate verification, signing, CSAT, privacy). No app chrome, no session needed. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-canvas">{children}</div>;
}
