<?php

namespace App\Filament\Widgets;

use App\Models\AttendanceDay;
use App\Models\Deduction;
use App\Services\AttendanceService;
use Filament\Widgets\Widget;

/** Dashboard hero: greeting, today's attendance and big "Clock in here" / "Clock out here" buttons. */
class ClockCard extends Widget
{
    protected static ?int $sort = 0;

    protected int|string|array $columnSpan = 'full';

    protected string $view = 'filament.widgets.clock-card';

    public static function canView(): bool
    {
        return (bool) auth()->user()?->canDo('attendance', 'create');
    }

    /** Today's attendance row and which punch comes next ('in' or 'out'). Shared with the top-bar pill. */
    public static function state(): array
    {
        $u = auth()->user();
        $day = AttendanceDay::where('user_id', $u->id)->where('date', AttendanceService::today())->with('punches')->first();
        $next = $day && $day->punches->sortBy('server_time')->last()?->type === 'in' ? 'out' : 'in';

        return [$day, $next];
    }

    protected function getViewData(): array
    {
        [$day, $next] = static::state();
        $u = auth()->user();
        $now = now('Africa/Lagos');

        $status = match (true) {
            ! $day?->first_in_at => ['Not clocked in yet', ''],
            $next === 'in' => ['Clocked out · '.ucfirst(str_replace('_', ' ', $day->status)), 'is-done'],
            $day->status === 'late' => ['Clocked in · late', 'is-late'],
            default => ['Clocked in · '.ucfirst(str_replace('_', ' ', $day->status)), 'is-ok'],
        };

        return [
            'greeting' => 'Good '.($now->hour < 12 ? 'morning' : ($now->hour < 17 ? 'afternoon' : 'evening')).', '.strtok($u->name, ' '),
            'today' => $now->format('l, j F Y'),
            'next' => $next,
            'status' => $status,
            'inAt' => $day?->first_in_at?->timezone('Africa/Lagos')->format('H:i'),
            'outAt' => $day?->last_out_at?->timezone('Africa/Lagos')->format('H:i'),
            'deductions' => (float) Deduction::where('user_id', $u->id)->where('period_month', now()->format('Y-m'))->where('status', '!=', 'waived')->sum('amount'),
        ];
    }
}
