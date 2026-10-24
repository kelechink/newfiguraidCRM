import type { Metadata } from "next";
import Link from "next/link";
import { ContactFilters, NewContactButton } from "@/components/crm/contact-controls";
import { scoreBand } from "@/domain/crm/contacts";
import { ago } from "@/lib/format";
import { requireCtx } from "@/server/auth/session";
import { channelLabel, listContacts } from "@/server/modules/crm/contacts-service";
import { creatableUnits } from "@/server/modules/crm/scope";
import { currentUnit, listUnits } from "@/server/modules/shell/service";
import { listAssignableUsers } from "@/server/modules/users/service";
import { Avatar } from "@/ui/avatar";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { cn } from "@/ui/cn";
import { PageHeader } from "@/ui/page-header";
import { StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { UNIT_STYLE } from "@/ui/units";

export const metadata: Metadata = { title: "Contacts" };

type SP = { q?: string; lifecycle?: string; owner?: string; source?: string; page?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const unit = await currentUnit();
  const [data, units, owners] = await Promise.all([
    listContacts(ctx, { q: sp.q || undefined, lifecycle: sp.lifecycle || undefined, source: sp.source || undefined, ownerId: sp.owner || undefined, unitId: unit?.id ?? null, page: sp.page ?? 1 }),
    listUnits(),
    listAssignableUsers(ctx, "crm.contacts"),
  ]);
  const createUnits = units.filter((u) => creatableUnits(ctx, "crm.contacts", units.map((x) => x.id)).includes(u.id)).map((u) => ({ id: u.id, name: u.name }));
  const pages = Math.ceil(data.total / 50);
  const qs = (page: number) => `/customers/contacts?${new URLSearchParams({ ...(sp as Record<string, string>), page: String(page) })}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Contacts"
        description={`${data.total.toLocaleString("en-NG")} people and businesses across your pipelines, inbox and forms.`}
        actions={
          <>
            <Link href="/customers/contacts/duplicates" className="text-[12.5px] font-medium text-ink-3 hover:text-ink">Find duplicates</Link>
            {createUnits.length > 0 && <NewContactButton units={createUnits} owners={owners.map((o) => ({ id: o.id, name: o.name }))} defaultUnitId={unit?.id ?? createUnits[0]!.id} />}
          </>
        }
      />
      <ContactFilters initial={sp} />
      <Card padded={false}>
        <Table>
          <THead>
            <tr>
              <Th>Name</Th>
              <Th>Stage</Th>
              <Th>Score</Th>
              <Th>Source</Th>
              <Th>Owner</Th>
              <Th>Last activity</Th>
            </tr>
          </THead>
          <tbody>
            {data.rows.length === 0 && <TableEmpty colSpan={6}>{sp.q ? "No contacts match that search." : "No contacts yet — they arrive from the inbox, forms and pipelines, or add one."}</TableEmpty>}
            {data.rows.map((c) => (
              <Tr key={c.id} href={`/customers/contacts/${c.id}`}>
                <Td>
                  <Link href={`/customers/contacts/${c.id}`} className="flex items-center gap-2.5">
                    <Avatar id={c.id} name={c.name} size={28} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-medium">
                        {c.name}
                        <span className={cn("size-1.5 rounded-full", UNIT_STYLE[c.unit]?.dot)} title={UNIT_STYLE[c.unit]?.label} />
                      </span>
                      <span className="block truncate text-2xs text-ink-3">{c.company?.name ?? c.email ?? c.phone ?? ""}</span>
                    </span>
                  </Link>
                </Td>
                <Td>
                  <StatusBadge status={c.lifecycle} />
                  {c.openDeals > 0 && <span className="ml-1.5 text-2xs text-ink-3">{c.openDeals} open deal{c.openDeals === 1 ? "" : "s"}</span>}
                </Td>
                <Td>
                  <Badge tone={scoreBand(c.score) === "hot" ? "danger" : scoreBand(c.score) === "warm" ? "warning" : "neutral"}>
                    {c.score} · {scoreBand(c.score)}
                  </Badge>
                </Td>
                <Td muted>{channelLabel(c.source)}</Td>
                <Td>{c.owner ? c.owner.name : <span className="text-warning">Unassigned</span>}</Td>
                <Td muted>{c.lastActivityAt ? ago(c.lastActivityAt) : "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-[12.5px]">
          {data.page > 1 && <Link className="rounded-md border border-line px-2.5 py-1 hover:bg-surface-2" href={qs(data.page - 1)}>← Previous</Link>}
          <span className="text-ink-3">Page {data.page} of {pages}</span>
          {data.page < pages && <Link className="rounded-md border border-line px-2.5 py-1 hover:bg-surface-2" href={qs(data.page + 1)}>Next →</Link>}
        </div>
      )}
    </div>
  );
}
