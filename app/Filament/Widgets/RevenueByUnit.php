<?php

namespace App\Filament\Widgets;

use App\Authz\Access;
use App\Models\BusinessUnit;
use App\Models\Expense;
use App\Models\Payment;
use Filament\Widgets\ChartWidget;

/** Revenue by unit over six months, with expense and profit toggles (filter). */
class RevenueByUnit extends ChartWidget
{
    protected static ?int $sort = 3;

    protected ?string $heading = 'Revenue by business unit (₦)';

    protected int|string|array $columnSpan = 'full';

    public ?string $filter = 'revenue';

    public static function canView(): bool
    {
        return Access::can(auth()->user(), 'finance.reports');
    }

    protected function getFilters(): ?array
    {
        return ['revenue' => 'Revenue', 'expenses' => 'Expenses', 'profit' => 'Profit'];
    }

    protected function getData(): array
    {
        $months = collect(range(5, 0))->map(fn ($i) => now()->subMonths($i)->startOfMonth());
        $palette = ['TELECOM' => '#0b6f9e', 'FIGUREWEB' => '#1e7f4f', 'ACADEMY' => '#b45309', 'PROCUREMENT' => '#6d28d9'];
        $sets = BusinessUnit::orderBy('code')->get()->map(function ($unit) use ($months, $palette) {
            $data = $months->map(function ($m) use ($unit) {
                $rev = (float) Payment::where('unit_id', $unit->id)->where('status', 'confirmed')->whereBetween('paid_at', [$m, $m->copy()->endOfMonth()])->sum('amount_ngn');
                $exp = (float) Expense::where('unit_id', $unit->id)->whereIn('status', ['approved', 'paid'])->whereBetween('date', [$m, $m->copy()->endOfMonth()])->sum('amount_ngn');

                return round(match ($this->filter) { 'expenses' => $exp, 'profit' => $rev - $exp, default => $rev });
            });

            return ['label' => $unit->name, 'data' => $data->all(), 'backgroundColor' => $palette[$unit->code] ?? '#64748b', 'borderRadius' => 4, 'borderSkipped' => 'bottom'];
        });

        return ['datasets' => $sets->all(), 'labels' => $months->map->format('M Y')->all()];
    }

    protected function getType(): string
    {
        return 'bar';
    }
}
