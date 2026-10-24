import type { Metadata } from "next";
import { InvoiceEditor, type InvoiceDraft } from "@/components/finance/invoice-editor";
import { addDays, localDate } from "@/domain/sop/schedule";
import { scopeOf } from "@/server/authz/context";
import { NotFoundError } from "@/server/authz/errors";
import { requireCtx } from "@/server/auth/session";
import { defaultVatRate, getInvoice, invoiceCustomers } from "@/server/modules/finance/invoices-service";
import { getSetting } from "@/server/modules/settings/service";
import { currentUnit, listUnits } from "@/server/modules/shell/service";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ kind?: string; id?: string; contact?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const scope = scopeOf(ctx, "finance.invoices", sp.id ? "EDIT" : "CREATE");
  if (!scope) notFound();
  const [units, customers, vat, usd, unit] = await Promise.all([listUnits(), invoiceCustomers(ctx), defaultVatRate(), getSetting("finance.usd_ngn_rate"), currentUnit()]);
  const allowed = units.filter((u) => scope === "ALL" || ctx.unitIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }));
  if (allowed.length === 0) notFound();

  let draft: InvoiceDraft;
  if (sp.id) {
    const inv = await getInvoice(ctx, sp.id).catch((e) => (e instanceof NotFoundError ? null : Promise.reject(e)));
    if (!inv || !inv.canEdit) notFound();
    draft = { id: inv.id, kind: inv.kind, unitId: inv.unit.id, contactId: inv.contact?.id ?? null, currency: inv.currency, fxRate: inv.fxRate, issueDate: inv.issueDate, dueDate: inv.dueDate, vatRate: inv.vatRate, notes: inv.notes ?? "", lines: inv.lines };
  } else {
    const today = localDate(new Date());
    const kind = sp.kind === "QUOTE" ? "QUOTE" : sp.kind === "CREDIT_NOTE" ? "CREDIT_NOTE" : "INVOICE";
    const contact = customers.find((c) => c.id === sp.contact);
    const unitId = contact?.unitId ?? (unit && allowed.some((u) => u.id === unit.id) ? unit.id : allowed[0]!.id);
    draft = { kind, unitId, contactId: contact?.id ?? null, currency: "NGN", fxRate: null, issueDate: today, dueDate: addDays(today, kind === "QUOTE" ? 30 : 14), vatRate: vat, notes: "", lines: [] };
  }
  return (
    <div className="grid gap-4">
      <h2 className="text-[15px] font-semibold">{draft.id ? "Edit draft" : draft.kind === "QUOTE" ? "New quote" : draft.kind === "CREDIT_NOTE" ? "New credit note" : "New invoice"}</h2>
      <InvoiceEditor draft={draft} units={allowed} customers={customers} defaultFx={Number(usd)} />
    </div>
  );
}
