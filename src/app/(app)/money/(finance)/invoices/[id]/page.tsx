import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceActions } from "@/components/finance/invoice-actions";
import { describeDue, formatDateTime, formatDay, money } from "@/lib/format";
import { can } from "@/server/authz/context";
import { NotFoundError } from "@/server/authz/errors";
import { requireCtx } from "@/server/auth/session";
import { getInvoice } from "@/server/modules/finance/invoices-service";
import { bankAccounts } from "@/server/modules/finance/money-service";
import { Card, CardHeader } from "@/ui/card";
import { cn } from "@/ui/cn";
import { humanize, StatusBadge } from "@/ui/status";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/ui/table";
import { UNIT_STYLE } from "@/ui/units";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params;
  const inv = await getInvoice(ctx, id).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
  if (!inv) notFound();
  const banks = can(ctx, "finance.income", "CREATE") ? await bankAccounts(ctx) : [];
  const outstanding = Math.max(0, inv.total - inv.amountPaid);
  const open = ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status);
  const due = open ? describeDue(`${inv.dueDate}T17:00:00+01:00`) : null;
  const customer = inv.company ?? inv.contact?.name ?? inv.carrier?.name ?? "No customer";

  return (
    <div className="grid gap-4">
      <Link href="/money/invoices" className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft className="size-3.5" /> Invoices</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.04em] text-ink-3"><span className={cn("size-1.5 rounded-full", UNIT_STYLE[inv.unit.code]?.dot)} />{inv.unit.name} · {humanize(inv.kind)}</p>
          <h2 className="mt-1 flex items-center gap-3 font-mono text-[20px] font-semibold tracking-tight">{inv.number} <StatusBadge status={inv.status} /></h2>
          <p className="mt-1 text-[13px] text-ink-2">
            {inv.contact ? <Link href={`/customers/contacts/${inv.contact.id}`} className="hover:text-accent">{customer}</Link> : customer}
            {inv.contact?.email && <span className="text-ink-3"> · {inv.contact.email}</span>}
          </p>
        </div>
        <InvoiceActions
          invoice={{ id: inv.id, number: inv.number, kind: inv.kind, status: inv.status, currency: inv.currency, outstanding, hasEmail: !!(inv.contact?.email ?? inv.carrier?.email) }}
          can={{ edit: inv.canEdit, send: can(ctx, "finance.invoices", "EDIT"), pay: can(ctx, "finance.income", "CREATE"), void: can(ctx, "finance.invoices", "DELETE"), convert: can(ctx, "finance.invoices", "CREATE") }}
          banks={banks}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="grid gap-4">
          <Card padded={false}>
            <Table>
              <THead><tr><Th>Description</Th><Th align="right">Qty</Th><Th align="right">Unit price</Th><Th align="right">Amount</Th></tr></THead>
              <tbody>
                {inv.lines.map((l) => (
                  <Tr key={l.id}>
                    <Td>{l.description}{!l.vatable && <span className="ml-2 text-2xs text-ink-3">No VAT</span>}</Td>
                    <Td align="right" muted>{l.quantity}</Td>
                    <Td align="right" muted>{money(l.unitPrice, inv.currency)}</Td>
                    <Td align="right" className="font-medium">{money(l.amount, inv.currency)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <dl className="ml-auto grid w-full max-w-[300px] gap-1.5 border-t border-line px-4 py-3 text-[13px]">
              <div className="flex justify-between"><dt className="text-ink-3">Subtotal</dt><dd className="tabular">{money(inv.subtotal, inv.currency)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-3">VAT {inv.vatRate}%</dt><dd className="tabular">{money(inv.vatAmount, inv.currency)}</dd></div>
              <div className="flex justify-between border-t border-line pt-1.5 font-semibold"><dt>Total</dt><dd className="tabular">{money(inv.total, inv.currency)}</dd></div>
              {inv.amountPaid > 0 && <div className="flex justify-between"><dt className="text-ink-3">Paid</dt><dd className="tabular text-success">−{money(inv.amountPaid, inv.currency)}</dd></div>}
              {inv.kind === "INVOICE" && inv.status !== "VOID" && <div className="flex justify-between font-semibold"><dt>Balance</dt><dd className="tabular">{money(outstanding, inv.currency)}</dd></div>}
            </dl>
          </Card>
          {inv.notes && <Card><p className="whitespace-pre-wrap text-[13px] text-ink-2">{inv.notes}</p></Card>}
          {inv.kind === "INVOICE" && (
            <Card padded={false}>
              <CardHeader title="Payments" className="px-4 pt-3" />
              <Table>
                <THead><tr><Th>Date</Th><Th>Method</Th><Th>Reference</Th><Th>Recorded by</Th><Th align="right">Amount</Th></tr></THead>
                <tbody>
                  {inv.payments.length === 0 && <TableEmpty colSpan={5}>No payments yet.</TableEmpty>}
                  {inv.payments.map((p) => (
                    <Tr key={p.id}>
                      <Td muted>{formatDay(p.receivedAt, { weekday: true })}</Td>
                      <Td>{humanize(p.method)}</Td>
                      <Td muted className="font-mono text-[12px]">{p.reference ?? "—"}</Td>
                      <Td muted>{p.recordedBy ?? "Automatic"}</Td>
                      <Td align="right" className="font-medium">{money(p.amount, p.currency)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
        <aside className="grid content-start gap-4">
          <Card>
            <dl className="grid gap-2.5 text-[13px]">
              <div className="flex justify-between gap-3"><dt className="text-ink-3">Issued</dt><dd>{formatDay(inv.issueDate)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-3">{inv.kind === "QUOTE" ? "Valid until" : "Due"}</dt><dd className={cn(due?.tone === "overdue" && "font-medium text-danger")}>{due ? due.label : formatDay(inv.dueDate)}</dd></div>
              {inv.periodStart && inv.periodEnd && <div className="flex justify-between gap-3"><dt className="text-ink-3">Period</dt><dd>{formatDay(inv.periodStart)} – {formatDay(inv.periodEnd)}</dd></div>}
              {inv.currency !== "NGN" && inv.fxRate && <div className="flex justify-between gap-3"><dt className="text-ink-3">Rate</dt><dd className="tabular">₦{inv.fxRate} / {inv.currency}</dd></div>}
              {inv.currency !== "NGN" && inv.fxRate && <div className="flex justify-between gap-3"><dt className="text-ink-3">In naira</dt><dd className="tabular">{money(inv.total * inv.fxRate)}</dd></div>}
              <div className="flex justify-between gap-3"><dt className="text-ink-3">Owner</dt><dd>{inv.owner ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-3">Sent</dt><dd>{inv.sentAt ? formatDateTime(inv.sentAt) : "Not yet"}</dd></div>
            </dl>
          </Card>
          {inv.payLink && open && (
            <Card>
              <p className="text-[12.5px] text-ink-3">Paystack payment link</p>
              <a href={inv.payLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1.5 break-all text-[13px] text-accent hover:underline">{inv.payLink.replace("https://", "")} <ExternalLink className="size-3 shrink-0" /></a>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
