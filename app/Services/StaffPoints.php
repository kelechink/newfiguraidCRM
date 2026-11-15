<?php

namespace App\Services;

use App\Models\AttendanceDay;
use App\Models\Conversation;
use App\Models\DailyReport;
use App\Models\StaffPoint;
use App\Models\Target;
use App\Models\Task;
use App\Models\TrainingCompletion;
use App\Models\User;
use Carbon\CarbonImmutable;

/** Monthly staff points (plain code). Rules are visible to everyone on the leaderboard. */
class StaffPoints
{
    public const RULES = [
        'on_time_day' => [2, 'Each day on time and signed off at 17:00 or later'],
        'late_day' => [-2, 'Each late arrival'],
        'early_departure' => [-2, 'Each early sign-off'],
        'absence' => [-5, 'Each absence or no-show'],
        'task_on_time' => [3, 'Each task completed by its due time'],
        'task_late' => [-1, 'Each task completed late or still overdue'],
        'fast_reply' => [1, 'Each customer conversation answered within the SLA'],
        'sla_breach' => [-1, 'Each conversation that had to be escalated'],
        'daily_report' => [1, 'Each end-of-day report'],
        'training_passed' => [5, 'Each training course passed'],
        'target_met' => [10, 'Each weekly target met'],
    ];

    public function forUser(User $u, string $month): array
    {
        $from = CarbonImmutable::parse("$month-01")->startOfMonth();
        $to = $from->endOfMonth();
        $days = AttendanceDay::where('user_id', $u->id)->whereBetween('date', [$from->toDateString(), $to->toDateString()])->get();
        $tasks = Task::where('assignee_id', $u->id)->whereNotNull('due_at')->whereBetween('due_at', [$from, $to])->get();
        $c = [
            'on_time_day' => $days->where('status', 'present')->where('minutes_early', 0)->count(),
            'late_day' => $days->where('status', 'late')->count(),
            'early_departure' => $days->where('minutes_early', '>', 0)->count(),
            'absence' => $days->where('status', 'absent')->count(),
            'task_on_time' => $tasks->filter(fn ($t) => $t->completed_at && $t->completed_at->lte($t->due_at))->count(),
            'task_late' => $tasks->filter(fn ($t) => ($t->completed_at && $t->completed_at->gt($t->due_at)) || (! $t->completed_at && $t->due_at->isPast()))->count(),
            'fast_reply' => Conversation::where('assignee_id', $u->id)->whereBetween('created_at', [$from, $to])->whereNotNull('first_response_at')->where('escalation_level', 0)->count(),
            'sla_breach' => Conversation::where('assignee_id', $u->id)->whereBetween('created_at', [$from, $to])->where('escalation_level', '>', 0)->count(),
            'daily_report' => DailyReport::where('user_id', $u->id)->whereBetween('date', [$from->toDateString(), $to->toDateString()])->count(),
            'training_passed' => TrainingCompletion::where('user_id', $u->id)->where('passed', true)->whereBetween('created_at', [$from, $to])->count(),
            'target_met' => Target::where('user_id', $u->id)->whereBetween('week_start', [$from->toDateString(), $to->toDateString()])->whereColumn('achieved', '>=', 'target')->count(),
        ];
        $breakdown = [];
        $total = 0;
        foreach ($c as $k => $count) {
            $pts = $count * self::RULES[$k][0];
            $breakdown[$k] = ['count' => $count, 'points' => $pts];
            $total += $pts;
        }

        return ['points' => $total, 'breakdown' => $breakdown];
    }

    public function recalc(string $month): void
    {
        $rows = User::where('status', 'active')->whereHas('staffProfile')->get()->map(fn ($u) => ['user' => $u] + $this->forUser($u, $month))->sortByDesc('points')->values();
        foreach ($rows as $i => $r) {
            StaffPoint::updateOrCreate(['user_id' => $r['user']->id, 'period_month' => $month], ['points' => $r['points'], 'breakdown' => $r['breakdown'], 'rank' => $i + 1]);
        }
    }
}
