import type { Metadata } from "next";
import { ExternalSignForm } from "@/components/public/public-actions";
import { peekSignature } from "@/server/modules/vault/service";
import { rateLimit, requestIp } from "@/server/ratelimit";
import { PublicShell } from "../../public-shell";

export const metadata: Metadata = { title: "Sign a document", robots: { index: false } };

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = rateLimit(`sign-view:${await requestIp()}`, 30, 15 * 60_000) ? await peekSignature(token) : null;
  if (!s) return <PublicShell title="This link has expired"><p className="text-[13.5px] text-ink-2">Signing links work once and expire after 14 days. Ask your Figuraid contact for a new one.</p></PublicShell>;
  return (
    <PublicShell title={s.title} wide>
      <p className="mb-4 text-[13.5px] text-ink-2">Hello {s.signerName}, please read the document below, then sign at the bottom.</p>
      {s.fileUrl && (
        <a href={s.fileUrl} target="_blank" rel="noreferrer" className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-4 text-[13.5px] hover:border-line-strong">
          <span><span className="block font-medium">Read the document</span><span className="block text-2xs text-ink-3">Opens in a new tab · fingerprint {s.sha256?.slice(0, 16)}…</span></span>
          <span className="text-accent">Open →</span>
        </a>
      )}
      <ExternalSignForm token={token} signerName={s.signerName} />
    </PublicShell>
  );
}
