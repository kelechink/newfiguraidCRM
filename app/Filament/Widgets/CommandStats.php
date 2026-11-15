<?php

namespace App\Filament\Widgets;

use App\Authz\Access;
use App\Domain\Money;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\FraudAlert;
use App\Models\Subscription;
use App\Models\UptimeCheck;
use App\Services\FxService;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;

/** Command dashboard: one headline per unit, cash, inbox health, pipeline, renewals, alerts. */
class CommandStats extends StatsOverviewWidget
{
    protected static ?int $sort = 2;

    protected ?string $pollingInterval = '60s';

    public static function canView(): bool
    {
        return Access::can(auth()->user(), 'dashboard.command');
    }

    protected function getStats(): array
    {
        $u = auth()->user();
        $stats = [];
        if (Access::can($u, 'telecom.margins')) {
            $t = Metrics::telecomMonth();
            $stats[] = Stat::make('Telecom gross margin (month)', Metrics::ngn($t['margin']))->description(($t['pct'] ?? '—').'% on '.Metrics::ngn($t['revenue']).' · '.number_format($t['minutes']).' min')->color($t['margin'] < 0 ? 'danger' : 'success')->icon('heroicon-o-signal');
        }
        $stats[] = Stat::make('FigureWeb MRR', Metrics::ngn(Metrics::mrr()))->description('Churn this month: '.(Metrics::churnPct() ?? 0).'%')->icon('heroicon-o-server');
        $e = Metrics::enrolments();
        $stats[] = Stat::make('Academy enrolments', (string) $e['active'])->description('Completion '.($e['completion'] ?? '—').'%')->icon('heroicon-o-academic-cap');
        if (Access::can($u, 'finance.cashflow')) {
            $cash = Metrics::cash();
            $runway = Money::runwayMonths($cash, Metrics::monthly('income'), Metrics::monthly('expense'));
            $stats[] = Stat::make('Cash position', Metrics::ngn($cash))->description($runway === null ? 'Not burning cash' : "$runway months of runway")->color($runway !== null && $runway < 3 ? 'danger' : 'gray')->icon('heroicon-o-banknotes');
        }
        $open = Conversation::where('status', 'open');
        $breached = (clone $open)->whereNull('first_response_at')->where('sla_due_at', '<', now())->count();
        $stats[] = Stat::make('Inbox', (clone $open)->count().' open')->description($breached ? "$breached past the 15-minute SLA" : 'All within SLA')->color($breached ? 'danger' : 'success')->icon('heroicon-o-inbox');
        $pipe = Deal::where('status', 'open')->get()->sum(fn ($d) => FxService::toNgn((float) $d->value, $d->currency) ?? 0);
        $stats[] = Stat::make('Open pipeline', Metrics::ngn($pipe))->description(Deal::where('status', 'open')->count().' deals')->icon('heroicon-o-funnel');
        $stats[] = Stat::make('Renewals next 30 days', (string) Subscription::where('side', 'customer')->where('status', 'active')->whereBetween('next_due_on', [today(), today()->addDays(30)])->count())->icon('heroicon-o-arrow-path');
        $alerts = FraudAlert::where('status', 'open')->count() + UptimeCheck::where('is_up', false)->count();
        $stats[] = Stat::make('Alerts', (string) $alerts)->description('Fraud, traffic and uptime')->color($alerts ? 'warning' : 'success')->icon('heroicon-o-bell-alert');

        return $stats;
    }
}
