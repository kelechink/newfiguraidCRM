<?php

namespace App\Filament\Widgets;

use App\Models\BankAccount;
use App\Models\BankTransaction;
use App\Models\Debt;
use App\Models\Enrolment;
use App\Models\Expense;
use App\Models\Payment;
use App\Models\Subscription;
use App\Models\TrafficEntry;
use App\Services\FxService;
use Carbon\CarbonImmutable;

/** Shared, plain-code business numbers in naira (never AI). */
class Metrics
{
    public static function telecomMonth(?CarbonImmutable $from = null): array
    {
        $from ??= CarbonImmutable::now()->startOfMonth();
        $rows = TrafficEntry::where('date', '>=', $from)->selectRaw('currency, sum(revenue) r, sum(cost) c, sum(minutes) m')->groupBy('currency')->get();
        $rev = $cost = $min = 0;
        foreach ($rows as $r) {
            $rate = FxService::rate($r->currency) ?? 0;
            $rev += $r->r * $rate;
            $cost += $r->c * $rate;
            $min += $r->m;
        }

        return ['revenue' => $rev, 'cost' => $cost, 'margin' => $rev - $cost, 'pct' => $rev > 0 ? round(($rev - $cost) / $rev * 100, 1) : null, 'minutes' => $min];
    }

    public static function mrr(): float
    {
        $div = ['monthly' => 1, 'quarterly' => 3, 'annually' => 12, 'biennially' => 24];

        return Subscription::where('side', 'customer')->where('status', 'active')->get()->sum(fn ($s) => (FxService::toNgn((float) $s->amount, $s->currency) ?? 0) / ($div[$s->cycle] ?? 12));
    }

    public static function churnPct(): ?float
    {
        $start = Subscription::where('side', 'customer')->where('created_at', '<', now()->startOfMonth())->count();
        $lost = Subscription::where('side', 'customer')->whereIn('status', ['cancelled', 'expired'])->where('updated_at', '>=', now()->startOfMonth())->count();

        return $start ? round($lost / $start * 100, 1) : null;
    }

    public static function cash(): float
    {
        return (float) BankAccount::sum('opening_balance') + (float) BankTransaction::sum('amount');
    }

    public static function monthly(string $kind, int $months = 3): float
    {
        $from = now()->subMonths($months)->startOfMonth();
        $to = now()->startOfMonth();
        $v = $kind === 'income'
            ? Payment::where('status', 'confirmed')->whereBetween('paid_at', [$from, $to])->sum('amount_ngn')
            : Expense::whereIn('status', ['approved', 'paid'])->whereBetween('date', [$from, $to])->sum('amount_ngn');

        return (float) $v / $months;
    }

    public static function enrolments(): array
    {
        $total = Enrolment::count();

        return ['active' => Enrolment::where('status', 'enrolled')->count(), 'completion' => $total ? round(Enrolment::where('status', 'completed')->count() / $total * 100) : null];
    }

    public static function debtOutstanding(): float
    {
        return Debt::get()->sum(fn ($d) => FxService::toNgn((float) $d->outstanding, $d->currency) ?? 0);
    }

    public static function ngn(float|int|null $v): string
    {
        if ($v === null) {
            return '—';
        }
        $a = abs($v);

        return ($v < 0 ? '−' : '').'₦'.($a >= 1e9 ? round($a / 1e9, 2).'bn' : ($a >= 1e6 ? round($a / 1e6, 2).'m' : number_format($a)));
    }
}
