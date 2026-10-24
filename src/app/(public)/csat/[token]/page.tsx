import type { Metadata } from "next";
import { CsatForm } from "@/components/public/public-actions";
import { peekCsat } from "@/server/modules/support/service";
import { PublicShell } from "../../public-shell";

export const metadata: Metadata = { title: "Rate our help", robots: { index: false } };

export default async function CsatPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await peekCsat(token);
  if (!t || t.done) return <PublicShell title={t?.done ? "Already rated — thank you" : "This link has expired"}><p className="text-[13.5px] text-ink-2">Rating links work once.</p></PublicShell>;
  return (
    <PublicShell title="How did we do?">
      <p className="mb-5 text-[13.5px] text-ink-2">Request {t.number}: {t.subject}</p>
      <CsatForm token={token} />
    </PublicShell>
  );
}
