import { FileSignature } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { formatDay } from "@/lib/format";
import { requireCtx } from "@/server/auth/session";
import { myDocuments } from "@/server/modules/hr/contracts-service";
import { Card } from "@/ui/card";
import { EmptyState } from "@/ui/empty-state";
import { PageHeader } from "@/ui/page-header";
import { StatusBadge } from "@/ui/status";

export const metadata: Metadata = { title: "My documents" };

export default async function MyDocumentsPage() {
  const ctx = await requireCtx();
  const docs = await myDocuments(ctx);
  const todo = docs.filter((d) => d.mustSign);
  const rest = docs.filter((d) => !d.mustSign);
  const list = (items: typeof docs) => (
    <Card padded={false}>
      <ul className="divide-y divide-line">
        {items.map((d) => (
          <li key={d.id}>
            <Link href={`/me/documents/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px] hover:bg-surface-2/60">
              <span><span className="block font-medium">{d.title}</span><span className="block text-2xs text-ink-3">{d.staff && d.staff !== ctx.name ? `${d.staff} · ` : ""}{formatDay(d.createdAt)}</span></span>
              <StatusBadge status={d.mustSign ? "PENDING" : d.status} label={d.mustSign ? "Sign now" : undefined} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
      <PageHeader title="My documents" description={ctx.status === "ONBOARDING" ? "Sign your contract pack to unlock the rest of Figuraid OS." : "Contracts and policies you've signed or need to sign."} />
      {docs.length === 0 && <EmptyState icon={<FileSignature className="size-5" />} title="Nothing to sign" body="Contracts and addenda from HR appear here." />}
      {todo.length > 0 && <section className="grid gap-2"><h2 className="text-[13px] font-semibold">To sign ({todo.length})</h2>{list(todo)}</section>}
      {rest.length > 0 && <section className="grid gap-2"><h2 className="text-[13px] font-semibold text-ink-2">Signed and in progress</h2>{list(rest)}</section>}
    </div>
  );
}
