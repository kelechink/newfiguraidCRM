<?php

namespace App\Filament\Pages;

use App\Authz\Access;
use App\Models\StaffPoint;
use App\Services\StaffPoints;
use BackedEnum;
use Filament\Pages\Page;

/** Staff points: leaderboard for everyone; full breakdown for yourself (HR and managers see everyone's). */
class StaffPointsBoard extends Page
{
    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-star';

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 0;

    protected static ?string $slug = 'staff-points';

    protected static ?string $title = 'Staff points';

    protected string $view = 'filament.pages.staff-points';

    public string $month = '';

    public static function canAccess(): bool
    {
        return Access::can(auth()->user(), 'dashboard.today');
    }

    public function mount(): void
    {
        $this->month = now()->format('Y-m');
    }

    public function refreshPoints(): void
    {
        abort_unless(Access::can(auth()->user(), 'hr.staff') || auth()->user()->isRole('ops_manager', 'unit_manager', 'super_admin', 'admin'), 403);
        app(StaffPoints::class)->recalc($this->month);
    }

    protected function getViewData(): array
    {
        if (! StaffPoint::where('period_month', $this->month)->exists()) {
            app(StaffPoints::class)->recalc($this->month);
        }
        $u = auth()->user();
        $seeAll = Access::can($u, 'hr.staff') || $u->isRole('ops_manager', 'unit_manager');

        return [
            'rows' => StaffPoint::where('period_month', $this->month)->with('user')->orderBy('rank')->get(),
            'mine' => StaffPoint::where('period_month', $this->month)->where('user_id', $u->id)->first(),
            'seeAll' => $seeAll,
            'months' => collect(range(0, 5))->mapWithKeys(fn ($i) => [now()->subMonths($i)->format('Y-m') => now()->subMonths($i)->format('F Y')]),
        ];
    }
}
