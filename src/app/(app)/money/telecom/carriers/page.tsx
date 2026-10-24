import type { Metadata } from "next";
import Link from "next/link";
import { CarrierAddButton } from "@/components/telecom/carrier-add";
import { money } from "@/lib/format";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { listCarriers } from "@/server/modules/telecom/carriers-service";
import { listAssignableUsers } from "@/server/modules/users/service";
import { Badge } from "@/ui/badge";
import { Card } from "@/ui/card";
import { humanize } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";

export const metadata: Metadata = { title: "Carriers" };

export default async function CarriersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx();
  const q = (await searchParams).q;
  const [rows, people] = await Promise.all([listCarriers(ctx, { q }), listAssignableUsers(ctx, "telecom.carriers")]);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <form action="/money/telecom/carriers"><input name="q" defaultValue={q} placeholder="Search carriers" className="h-8 w-56 rounded-md border border-line bg-surface px-2.5 text-[13px] placeholder:text-ink-3 focus:border-accent focus:outline-none" /></form>
        <p className="text-[13px] text-ink-3">{rows.length} carriers</p>
        {can(ctx, "telecom.carriers", "CREATE") && <div className="ml-auto"><CarrierAddButton people={people.map((p) => ({ id: p.id, name: p.name }))} /></div>}
      </div>
      <Card padded={false}>
        <Table>
          <THead><tr><Th>Carrier</Th><Th>Terms</Th><Th>Increments</Th><Th>Payment</Th><Th align="right">Balance / exposure</Th><Th>Manager</Th></tr></THead>
          <tbody>
            {rows.length === 0 && <TableEmpty colSpan={6}>No carriers yet.</TableEmpty>}
            {rows.map((c) => (
              <Tr key={c.id} href={`/money/telecom/carriers/${c.id}`}>
                <Td>
                  <Link href={`/money/telecom/carriers/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>
                  <p className="text-2xs text-ink-3">{humanize(c.type)}{c.country && ` · ${c.country}`}{!c.isActive && " · inactive"}</p>
                </Td>
                <Td className="text-[12.5px]">{c.accounts.map((a) => <p key={a.id}><span className="text-ink-3">{a.side === "VENDOR" ? "Buy" : "Sell"}</span> {a.terms} {a.currency}</p>)}</Td>
                <Td muted className="text-[12.5px]">{c.accounts.map((a) => <p key={a.id}>{a.increments}</p>)}</Td>
                <Td className="text-[12.5px]">{c.accounts.map((a) => <p key={a.id}>{humanize(a.paymentMode)}</p>)}</Td>
                <Td align="right" className="text-[12.5px]">
                  {c.accounts.map((a) => (
                    <p key={a.id}>
                      {a.balance != null ? <span className={a.lowBalance ? "font-medium text-danger" : ""}>{money(a.balance, a.currency)}</span> : a.exposure != null ? (
                        <span>{money(a.exposure, a.currency)}{a.creditLimit != null && <span className="text-ink-3"> / {money(a.creditLimit, a.currency, { compact: true })}</span>}{a.credit !== "ok" && <Badge tone={a.credit === "over" ? "danger" : "warning"} className="ml-1.5">{a.credit === "over" ? "Over limit" : "80%"}</Badge>}</span>
                      ) : "—"}
                    </p>
                  ))}
                </Td>
                <Td muted>{c.manager?.name ?? "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
