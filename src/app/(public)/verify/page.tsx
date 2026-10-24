import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Input } from "@/ui/field";
import { PublicShell } from "../public-shell";

export const metadata: Metadata = { title: "Verify a certificate" };

export default async function VerifyIndex({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const code = (await searchParams).code?.trim();
  if (code) redirect(`/verify/${encodeURIComponent(code.slice(0, 20))}`);
  return (
    <PublicShell eyebrow="Figure Academy" title="Verify a certificate">
      <form action="/verify" className="flex gap-2">
        <Input name="code" required placeholder="FA-XXXX-XXXX-XXXX" className="h-10 font-mono uppercase" aria-label="Certificate ID" />
        <button className="h-10 rounded-md bg-accent px-4 text-[13px] font-medium text-white">Check</button>
      </form>
      <p className="mt-3 text-[12.5px] text-ink-3">Or scan the QR code on the certificate.</p>
    </PublicShell>
  );
}
