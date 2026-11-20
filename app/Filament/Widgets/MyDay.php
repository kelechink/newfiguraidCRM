<?php

namespace App\Filament\Widgets;

use App\Models\AttendanceDay;
use App\Models\Conversation;
use App\Models\Deduction;
use App\Models\Task;
use App\Services\AttendanceService;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;

/** Everyone's first card: today's attendance, my tasks, my conversations, my deductions. */
class MyDay extends StatsOverviewWidget
{
    protected static ?int $sort = 1;

    protected function getHeading(): ?string
    {
        return 'My day at a glance';
    }

    protected function getStats(): array
    {
        $u = auth()->user();
        $day = AttendanceDay::where('user_id', $u->id)->where('date', AttendanceService::today())->first();
        $tasks = Task::where('assignee_id', $u->id)->where('status', '!=', 'done');

        return [
            Stat::make('Attendance today', $day?->first_in_at ? ucfirst(str_replace('_', ' ', $day->status)).' · in '.$day->first_in_at->format('H:i') : 'Not clocked in')
                ->description($day?->first_in_at ? ($day->last_out_at ? 'Clocked out '.$day->last_out_at->format('H:i') : 'Clock out from your phone before you leave') : 'Tap to clock in at Kano House')
                ->url('/clock')->color($day?->first_in_at ? ($day->status === 'late' ? 'warning' : 'success') : 'danger')->icon('heroicon-o-map-pin'),
            Stat::make('My open tasks', (string) (clone $tasks)->count())->description((clone $tasks)->where('due_at', '<', now())->count().' overdue')->url('/app/tasks')->icon('heroicon-o-check-circle'),
            Stat::make('My conversations', (string) Conversation::where('assignee_id', $u->id)->where('status', 'open')->count())->description('Reply within 15 minutes')->url('/app/conversations')->icon('heroicon-o-chat-bubble-left-right'),
            Stat::make('My deductions this month', '₦'.number_format((float) Deduction::where('user_id', $u->id)->where('period_month', now()->format('Y-m'))->where('status', '!=', 'waived')->sum('amount')))->description('Late ₦500 · early ₦500 · absent ₦3,000')->icon('heroicon-o-minus-circle'),
        ];
    }
}
