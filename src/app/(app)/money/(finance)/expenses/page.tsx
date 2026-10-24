import type { Metadata } from "next";
import { ExpensesTable, NewExpenseButton } from "@/components/finance/expenses";
import { can, scopeOf } from "@/server/authz/context";
import { requireCtx } from "@/server/auth/session";
import { bankAccounts, expenseCategories, listExpenses } from "@/server/modules/finance/money-service";
import { currentRates } from "@/server/fx/rates";
import { currentUnit, listUnits } from "@/server/modules/shell/service";
import { LinkTabs } from "@/ui/tabs";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ status?: string; mine?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const unit = await currentUnit();
  const [rows, cats, units, banks, usd] = await Promise.all([
    listExpenses(ctx, { status: sp.status, unitId: unit?.id ?? null, mine: !!sp.mine }),
    expenseCategories(),
    listUnits(),
    bankAccounts(ctx),
    currentRates(),
  ]);
  const scope = scopeOf(ctx, "finance.expenses", "CREATE");
  const tab = sp.mine ? "mine" : sp.status ?? "all";
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <LinkTabs
          active={tab}
          tabs={[
            { key: "all", href: "/money/expenses", label: "All" },
            { key: "SUBMITTED", href: "/money/expenses?status=SUBMITTED", label: "Awaiting approval", count: rows.filter((r) => r.status === "SUBMITTED").length || undefined },
            { key: "APPROVED", href: "/money/expenses?status=APPROVED", label: "To pay" },
            { key: "mine", href: "/money/expenses?mine=1", label: "My claims" },
          ]}
        />
        {can(ctx, "finance.expenses", "CREATE") && (
          <NewExpenseButton categories={cats} units={units.filter((u) => scope === "ALL" || ctx.unitIds.includes(u.id)).map((u) => ({ id: u.id, name: u.name }))} rates={usd} />
        )}
      </div>
      <ExpensesTable rows={rows} banks={banks} canPay={!!scopeOf(ctx, "finance.expenses", "APPROVE")} />
    </div>
  );
}
