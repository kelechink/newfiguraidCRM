<?php

namespace App\Filament\Pages;

use App\Authz\Access;
use App\Domain\Money;
use App\Filament\Widgets\Metrics;
use App\Models\Debt;
use App\Models\Expense;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PayrollRun;
use App\Models\Subscription;
use App\Services\FxService;
use BackedEnum;
use Filament\Pages\Page;

/** Admin finance dashboard (Super Admin & Admin): income, expenditure, P/L, salaries, cash, debts, forecast. */
class FinanceDashboard extends Page
{
    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-presentation-chart-line';

    protected static string|\UnitEnum|null $navigationGroup = 'Money';

    protected static ?int $navigationSort = 0;

    protected static ?string $title = 'Finance overview';

    protected string $view = 'filament.pages.finance-dashboard';

    public string $period = 'month';

    public static function canAccess(): bool
    {
        return Access::can(auth()->user(), 'dashboard.finance');
    }

    protected function getViewData(): array
    {
        $from = match ($this->period) { 'quarter' => now()->startOfQuarter(), 'year' => now()->startOfYear(), default => now()->startOfMonth() };
        $income = (float) Payment::where('status', 'confirmed')->where('paid_at', '>=', $from)->sum('amount_ngn');
        $expenses = (float) Expense::whereIn('status', ['approved', 'paid'])->where('date', '>=', $from)->sum('amount_ngn');
        $salaries = PayrollRun::whereIn('status', ['approved', 'signed_off', 'paid'])->where('period_month', '>=', $from->format('Y-m'))->get()->sum(fn ($r) => (float) $r->total_gross);
        $receivable = Invoice::whereIn('status', ['sent', 'part_paid', 'overdue'])->get()->sum(fn ($i) => $i->outstanding() * ($i->currency === 'NGN' ? 1 : (float) $i->fx_rate));
        $payables = Expense::where('status', 'approved')->whereNull('paid_at')->sum('amount_ngn') + Subscription::where('side', 'own')->whereIn('status', ['active', 'pending'])->where('next_due_on', '<=', today()->addDays(30))->get()->sum(fn ($s) => FxService::toNgn((float) $s->amount, $s->currency) ?? 0);
        $cash = Metrics::cash();
        $flows = [];
        foreach (Invoice::whereIn('status', ['sent', 'part_paid', 'overdue'])->get() as $i) {
            $flows[] = ['date' => $i->due_date->toDateString(), 'amount' => $i->outstanding() * ($i->currency === 'NGN' ? 1 : (float) $i->fx_rate), 'kind' => 'receivable', 'probability' => $i->status === 'overdue' ? 0.6 : 0.85];
        }
        foreach (Subscription::where('side', 'own')->whereIn('status', ['active', 'pending'])->get() as $s) {
            $flows[] = ['date' => $s->next_due_on->toDateString(), 'amount' => -(FxService::toNgn((float) $s->amount, $s->currency) ?? 0), 'kind' => 'subscription', 'probability' => 1];
        }
        foreach (Debt::where('outstanding', '>', 0)->get() as $d) {
            if ($d->next_payment_on && $d->instalment) {
                foreach ([0, 1, 2] as $k) {
                    $flows[] = ['date' => $d->next_payment_on->copy()->addMonths($k)->toDateString(), 'amount' => -(float) $d->instalment, 'kind' => 'payable', 'probability' => 1];
                }
            }
        }
        $avgExp = Metrics::monthly('expense');
        foreach ([0, 1, 2] as $k) {
            $flows[] = ['date' => now()->addMonths($k)->endOfMonth()->toDateString(), 'amount' => -$avgExp, 'kind' => 'recurring', 'probability' => 1];
        }
        $weeks = Money::projectCash($cash, $flows, 'expected', today()->toDateString(), 13, (float) \App\Models\Setting::get('finance.min_cash_ngn', 0));
        $at = fn ($w) => $weeks[min(count($weeks) - 1, $w)]['closing'] ?? $cash;

        return [
            'income' => $income, 'expenses' => $expenses, 'profit' => $income - $expenses, 'salaries' => $salaries, 'cash' => $cash,
            'receivable' => $receivable, 'payables' => $payables, 'debt' => Metrics::debtOutstanding(),
            'runway' => Money::runwayMonths($cash, Metrics::monthly('income'), Metrics::monthly('expense')),
            'forecast' => ['30 days' => $at(4), '60 days' => $at(8), '90 days' => $at(12)], 'weeks' => $weeks,
            'debts' => Debt::orderBy('next_payment_on')->get()->map(fn ($d) => ['d' => $d, 'months' => Money::payoffMonths((float) $d->outstanding, (float) $d->interest_rate_pct, (float) $d->instalment)]),
            'byUnit' => \App\Models\BusinessUnit::orderBy('code')->get()->map(fn ($u) => [
                'name' => $u->name,
                'in' => (float) Payment::where('unit_id', $u->id)->where('status', 'confirmed')->where('paid_at', '>=', $from)->sum('amount_ngn'),
                'out' => (float) Expense::where('unit_id', $u->id)->whereIn('status', ['approved', 'paid'])->where('date', '>=', $from)->sum('amount_ngn'),
            ]),
        ];
    }
}
