"use client";

import { ChevronRight, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { formatDateTime } from "@/lib/format";
import { verifyAuditAction } from "@/server/modules/admin/actions";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { Input } from "@/ui/field";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { useToast } from "@/ui/toast";

type Row = {
  id: string;
  at: string;
  actor: { id: string; name: string } | null;
  actorType: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
};

export function AuditViewer({ rows, filter }: { rows: Row[]; filter: { action: string; entity: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const p = new URLSearchParams();
            if (f.get("action")) p.set("action", String(f.get("action")));
            if (f.get("entity")) p.set("entity", String(f.get("entity")));
            router.push(`/settings/audit?${p}`);
          }}
        >
          <Input name="action" defaultValue={filter.action} placeholder="Action starts with… e.g. invoice." className="w-56" aria-label="Filter by action" />
          <Input name="entity" defaultValue={filter.entity} placeholder="Entity type or id" className="w-48" aria-label="Filter by entity" />
          <Button type="submit">Filter</Button>
        </form>
        <Button
          variant="secondary"
          className="ml-auto"
          loading={verifying}
          onClick={async () => {
            setVerifying(true);
            const res = await verifyAuditAction();
            setVerifying(false);
            if (!res.ok) return toast({ tone: "error", title: res.error });
            toast(
              res.data.ok
                ? { tone: "success", title: "Audit log intact", body: `${res.data.checked} entries verified — none altered or removed.` }
                : { tone: "error", title: "Audit chain broken", body: `Entry ${res.data.brokenAt} doesn't match. Investigate immediately.` },
            );
          }}
        >
          <ShieldCheck className="size-3.5" /> Verify integrity
        </Button>
      </div>
      <Card padded={false}>
        <Table>
          <THead>
            <tr>
              <Th className="w-8" />
              <Th>When</Th>
              <Th>Who</Th>
              <Th>Action</Th>
              <Th>Record</Th>
              <Th>IP</Th>
            </tr>
          </THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={6}>No entries match.</TableEmpty>}
            {rows.map((r) => (
              <Fragment key={r.id}>
                <Tr className="cursor-pointer" href="#">
                  <Td onClick={() => setOpen(open === r.id ? null : r.id)}>
                    <ChevronRight className={cn("size-3.5 text-ink-3 transition-transform", open === r.id && "rotate-90")} />
                  </Td>
                  <Td muted className="whitespace-nowrap tabular">{formatDateTime(r.at)}</Td>
                  <Td>{r.actor?.name ?? <span className="text-ink-3">{r.actorType}</span>}</Td>
                  <Td>
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[12px]">{r.action}</code>
                  </Td>
                  <Td muted className="font-mono text-[12px]">
                    {r.entityType} {r.entityId?.slice(-8)}
                  </Td>
                  <Td muted className="font-mono text-[12px]">{r.ip ?? ""}</Td>
                </Tr>
                {open === r.id && (
                  <tr className="border-b border-line bg-surface-2/40">
                    <td />
                    <td colSpan={5} className="grid gap-3 py-3 pr-4 sm:grid-cols-2">
                      {(["before", "after"] as const).map((k) => (
                        <div key={k}>
                          <p className="mb-1 text-2xs font-semibold uppercase tracking-[0.05em] text-ink-3">{k}</p>
                          <pre className="scrollbar-thin max-h-60 overflow-auto rounded-md border border-line bg-surface p-2 font-mono text-[11.5px] leading-4 text-ink-2">
                            {r[k] ? JSON.stringify(r[k], null, 2) : "—"}
                          </pre>
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </Table>
      </Card>
      <p className="text-2xs text-ink-3">Append-only: the database rejects edits and deletions, and every entry is chained to the previous one by hash. Showing the latest 100.</p>
    </div>
  );
}
