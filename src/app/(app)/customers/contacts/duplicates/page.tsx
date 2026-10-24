import type { Metadata } from "next";
import Link from "next/link";
import { MergeGroup } from "@/components/crm/merge-group";
import { requireCtx } from "@/server/auth/session";
import { listDuplicateGroups } from "@/server/modules/crm/contacts-service";
import { Card } from "@/ui/card";
import { EmptyState } from "@/ui/empty-state";
import { PageHeader } from "@/ui/page-header";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Duplicate contacts" };

export default async function DuplicatesPage() {
  const ctx = await requireCtx();
  const groups = await listDuplicateGroups(ctx);
  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-5">
      <PageHeader title="Duplicate contacts" description="Contacts sharing an email or phone number. Merge keeps the oldest and moves everything onto it." actions={<Link href="/customers/contacts" className="text-[12.5px] text-ink-3 hover:text-ink">← Contacts</Link>} />
      {groups.length === 0 ? (
        <EmptyState icon={<CheckCircle2 className="size-5" />} title="No duplicates found" body="New contacts from the inbox and forms are matched automatically by email and phone." />
      ) : (
        groups.map((g) => (
          <Card key={g.key}>
            <MergeGroup kind={g.kind} value={g.key} contacts={g.contacts} />
          </Card>
        ))
      )}
    </div>
  );
}
