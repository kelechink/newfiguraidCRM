import type { ReactNode } from "react";
import { FinanceTabs } from "@/components/finance/finance-tabs";
import { can } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { PageHeader } from "@/ui/page-header";
import { ExportMenu } from "@/components/finance/export-menu";

export default async function FinanceLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCtx();
  const tabs = [
    can(ctx, "finance.reports", "VIEW") ? { key: "overview", href: "/money", label: "Overview" } : null,
    can(ctx, "finance.invoices", "VIEW") ? { key: "invoices", href: "/money/invoices", label: "Invoices" } : null,
    can(ctx, "finance.income", "VIEW") ? { key: "payments", href: "/money/payments", label: "Income" } : null,
    can(ctx, "finance.expenses", "VIEW") ? { key: "expenses", href: "/money/expenses", label: "Expenses" } : null,
    can(ctx, "finance.bills", "VIEW") ? { key: "bills", href: "/money/bills", label: "Bills" } : null,
    can(ctx, "finance.bills", "VIEW") || can(ctx, "subscriptions", "VIEW") ? { key: "vendors", href: "/money/vendors", label: "What we owe" } : null,
    can(ctx, "finance.cashflow", "VIEW") ? { key: "cashflow", href: "/money/cashflow", label: "Cash flow" } : null,
    can(ctx, "subscriptions", "VIEW") ? { key: "subscriptions", href: "/money/subscriptions", label: "Subscriptions" } : null,
    can(ctx, "procurement", "VIEW") ? { key: "procurement", href: "/money/procurement", label: "Procurement" } : null,
    can(ctx, "finance.reports", "VIEW") ? { key: "rates", href: "/money/rates", label: "Rates" } : null,
  ].filter((t): t is { key: string; href: string; label: string } => !!t);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Finance" description="Money in and out across Academy, FigureWeb, Telecom and HQ." actions={can(ctx, "exports", "CREATE") ? <ExportMenu /> : undefined} />
      <FinanceTabs tabs={tabs} />
      {children}
    </div>
  );
}
