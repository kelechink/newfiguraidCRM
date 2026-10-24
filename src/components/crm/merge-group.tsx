"use client";

import Link from "next/link";
import { formatDay } from "@/lib/format";
import { mergeContactsAction } from "@/server/modules/crm/actions";
import { Button } from "@/ui/button";
import { useAction } from "@/ui/use-action";

export function MergeGroup({ kind, value, contacts }: { kind: string; value: string; contacts: { id: string; name: string; createdAt: string }[] }) {
  const merge = useAction(mergeContactsAction, { success: "Merged" });
  const sorted = [...contacts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const [survivor, ...rest] = sorted;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-ink-3">Same {kind}: <span className="font-mono text-ink-2">{value}</span></p>
        <ul className="mt-1 grid gap-0.5 text-[13px]">
          {sorted.map((c, i) => (
            <li key={c.id}><Link href={`/customers/contacts/${c.id}`} className="font-medium hover:underline">{c.name}</Link> <span className="text-2xs text-ink-3">added {formatDay(c.createdAt)}{i === 0 ? " · keeps" : ""}</span></li>
          ))}
        </ul>
      </div>
      <Button variant="secondary" loading={merge.pending} onClick={async () => { for (const d of rest) await merge.run({ survivorId: survivor!.id, duplicateId: d.id }); }}>
        Merge {rest.length + 1} into one
      </Button>
    </div>
  );
}
