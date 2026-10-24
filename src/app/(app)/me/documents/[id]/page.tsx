import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SignedPdfButton, SignPanel } from "@/components/hr/sign";
import { formatDateTime } from "@/lib/format";
import { NotFoundError } from "@/server/authz/errors";
import { requireCtx } from "@/server/auth/session";
import { getDocument } from "@/server/modules/hr/contracts-service";
import { Card } from "@/ui/card";
import { Markdown } from "@/ui/markdown";
import { StatusBadge } from "@/ui/status";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const d = await getDocument(ctx, (await params).id).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!d) notFound();
  return (
    <div className="mx-auto grid w-full max-w-[760px] gap-4">
      <Link href="/me/documents" className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" /> My documents</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight">{d.title} <StatusBadge status={d.status} /></h1>
        <SignedPdfButton documentId={d.id} />
      </div>
      <Card className="px-6 py-6 sm:px-8"><Markdown source={d.body} className="text-[14px] leading-relaxed" /></Card>
      <Card>
        <ul className="grid gap-2 text-[13px]">
          {d.signatures.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2">
              <span>{s.role === "STAFF" ? "Staff member" : "For Figuraid Ltd"}: <span className="font-medium">{s.name}</span></span>
              <span className="text-[12px] text-ink-3">{s.status === "signed" ? `Signed “${s.typedName}” · ${formatDateTime(s.signedAt!)}` : "Awaiting signature"}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 text-2xs text-ink-3"><ShieldCheck className="size-3.5" /> Fingerprint {d.contentHash?.slice(0, 16)}… — every signature is bound to this exact text.</p>
      </Card>
      {d.canSign && <Card><SignPanel documentId={d.id} contentHash={d.contentHash!} name={ctx.name} role={d.signAs!} /></Card>}
    </div>
  );
}
