<?php

namespace App\Services\StaffAgents;

use App\Models\AttendanceDay;
use App\Models\AttendanceExcuse;
use App\Models\DailyReport;
use App\Models\LeaveRequest;
use App\Models\PublicHoliday;
use App\Models\StaffPoint;
use App\Models\StaffProfile;
use App\Models\TrainingCompletion;
use App\Models\TrainingCourse;
use App\Models\User;
use App\Services\AgentMessenger;
use App\Services\AttendanceService;
use App\Services\StaffPoints;
use Carbon\CarbonImmutable;

/**
 * HR Manager agent. Plain-code duties; it never sees or sends salaries, bank details or ID numbers.
 * It nudges, requests, follows up and escalates — approvals stay with HR and managers.
 */
class HrAgent
{
    public const KEY = 'hr';

    public function __construct(private AgentMessenger $m) {}

    private function staff()
    {
        return User::where('status', 'active')->whereHas('staffProfile')->with('staffProfile')->get();
    }

    private function hrPeople()
    {
        return User::where('status', 'active')->whereHas('role', fn ($r) => $r->where('key', 'hr'))->get();
    }

    private function workday(CarbonImmutable $d): bool
    {
        return $d->isWeekday() && ! PublicHoliday::whereDate('date', $d->toDateString())->exists();
    }

    /** 09:20 — gentle nudge to anyone not yet clocked in (not on leave). */
    public function morning(): int
    {
        $now = CarbonImmutable::now('Africa/Lagos');
        if (! $this->workday($now)) {
            return 0;
        }
        $n = 0;
        $today = $now->toDateString();
        foreach ($this->staff() as $u) {
            $in = AttendanceDay::where('user_id', $u->id)->where('date', $today)->whereNotNull('first_in_at')->exists();
            $leave = LeaveRequest::where('user_id', $u->id)->where('status', 'approved')->whereDate('start_date', '<=', $today)->whereDate('end_date', '>=', $today)->exists();
            if (! $in && ! $leave && AgentMessenger::once("hr:nudge:$u->id:$today")) {
                $n += (int) $this->m->tell(self::KEY, $u, 'You have not clocked in yet', 'Good morning. I don\'t see a clock-in for you today. If you are at Kano House, clock in now from your phone. If you are away for work or unwell, submit leave or an excuse so it isn\'t recorded as an absence (₦3,000).', '/clock', false);
            }
        }

        return $n;
    }

    /** 10:00 daily — yesterday's no-shows/absences: ask for an excuse; remind approvers of waiting items. */
    public function daily(): int
    {
        $n = 0;
        $y = CarbonImmutable::now('Africa/Lagos')->subDay()->toDateString();
        foreach (AttendanceDay::where('date', $y)->where('status', 'absent')->with('user')->get() as $d) {
            if ($d->user && $d->user->status === 'active' && ! AttendanceExcuse::where('attendance_day_id', $d->id)->exists() && AgentMessenger::once("hr:absent:$d->id", 7 * 86400)) {
                $why = $d->missing_clock_out ? 'you clocked in but did not clock out, so the day counts as a no-show' : 'there is no clock-in for you';
                $n += (int) (bool) $this->m->request(self::KEY, $d->user, 'Explain your attendance on '.CarbonImmutable::parse($y)->format('D j M'), "Yesterday $why. If there was a valid reason (work outside the office, illness, emergency), submit an excuse in Attendance with any evidence. Otherwise the ₦3,000 deduction stays.", now()->addDays(2), "absence-$d->id", '/app/attendance-days');
            }
        }
        $stale = LeaveRequest::where('status', 'pending')->where('created_at', '<', now()->subDay())->count() + AttendanceExcuse::where('status', 'pending')->where('created_at', '<', now()->subDay())->count();
        if ($stale && AgentMessenger::once('hr:approvals:'.today()->toDateString())) {
            foreach ($this->hrPeople() as $h) {
                $n += (int) $this->m->tell(self::KEY, $h, "$stale leave/excuse request(s) waiting over 24 hours", 'Staff are waiting for a decision. Please review them today.', '/app/leave-requests');
            }
        }
        // Onboarding: unsigned contract packs
        foreach (User::where('status', 'onboarding')->where('created_at', '<', now()->subDay())->get() as $u) {
            if (AgentMessenger::once("hr:contract:$u->id", 2 * 86400)) {
                $n += (int) $this->m->tell(self::KEY, $u, 'Please sign your contract pack', 'Welcome to Figuraid! Your work modules open as soon as you read and sign your contract pack and the privacy policy.', '/app/onboarding');
            }
        }
        // Probation ending in 14 days → ask the manager for a review
        foreach (StaffProfile::whereDate('probation_ends', today()->addDays(14))->with('user')->get() as $p) {
            if ($p->user && ($mgr = AgentMessenger::managerOf($p->user))) {
                $n += (int) (bool) $this->m->request(self::KEY, $mgr, "Probation review: {$p->user->name}", "{$p->user->name}'s probation ends on ".$p->probation_ends->format('j M').'. Please send HR your recommendation (confirm, extend or end) with two or three lines on performance.', now()->addDays(7), "probation-$p->id");
            }
        }
        // Required training not completed within 14 days of start
        $required = TrainingCourse::where('required_for_new_staff', true)->where('is_active', true)->get();
        foreach ($this->staff() as $u) {
            foreach ($required as $c) {
                if (! TrainingCompletion::where('user_id', $u->id)->where('training_course_id', $c->id)->where('passed', true)->exists() && AgentMessenger::once("hr:training:$u->id:$c->id", 5 * 86400)) {
                    $n += (int) $this->m->tell(self::KEY, $u, "Complete your training: $c->title", 'This short course is required for everyone. It takes about 15 minutes and ends with a quick quiz.', '/app/training-courses', false);
                }
            }
        }
        // Birthdays and work anniversaries in #General
        foreach ($this->staff() as $u) {
            if ($u->birthday && $u->birthday->format('m-d') === today()->format('m-d') && AgentMessenger::once("hr:bday:$u->id:".today()->year, 2 * 86400)) {
                $this->m->announce(self::KEY, "🎉 Happy birthday, {$u->name}! Wishing you a great year from all of us at Figuraid.");
            }
            $start = $u->staffProfile?->start_date;
            if ($start && $start->format('m-d') === today()->format('m-d') && $start->year < today()->year && AgentMessenger::once("hr:anniv:$u->id:".today()->year, 2 * 86400)) {
                $years = today()->year - $start->year;
                $this->m->announce(self::KEY, "👏 {$u->name} celebrates $years year".($years > 1 ? 's' : '').' at Figuraid today. Thank you!');
            }
        }

        return $n;
    }

    /** 17:15 — remind people who haven't sent today's end-of-day report. */
    public function evening(): int
    {
        $now = CarbonImmutable::now('Africa/Lagos');
        if (! $this->workday($now)) {
            return 0;
        }
        $n = 0;
        foreach ($this->staff() as $u) {
            $worked = AttendanceDay::where('user_id', $u->id)->where('date', $now->toDateString())->whereNotNull('first_in_at')->exists();
            if ($worked && ! DailyReport::where('user_id', $u->id)->whereDate('date', $now->toDateString())->exists() && AgentMessenger::once("hr:eod:$u->id:".$now->toDateString())) {
                $n += (int) $this->m->tell(self::KEY, $u, 'Your end-of-day report', 'Before you sign off at 17:00, add three lines: what you finished, what blocked you, and tomorrow\'s plan. Remember to clock out from your phone.', '/app/daily-reports/create', false);
            }
        }

        return $n;
    }

    /** 1st of the month — points for last month, leaderboard post, personal summaries. */
    public function monthlyPoints(?string $month = null): int
    {
        $month ??= now()->subMonth()->format('Y-m');
        app(StaffPoints::class)->recalc($month);
        $rows = StaffPoint::where('period_month', $month)->with('user')->orderBy('rank')->get();
        if ($rows->isEmpty()) {
            return 0;
        }
        $label = CarbonImmutable::parse("$month-01")->format('F Y');
        $top = $rows->take(3)->map(fn ($r, $i) => ['🥇', '🥈', '🥉'][$i].' '.$r->user->name.' — '.$r->points.' pts')->implode("\n");
        $this->m->announce(self::KEY, "Staff points for $label\n$top\n\nEveryone can see their own breakdown under Team → Points.");
        foreach ($rows as $r) {
            $lines = collect($r->breakdown)->filter(fn ($b) => $b['count'] > 0)->map(fn ($b, $k) => '• '.StaffPoints::RULES[$k][1].': '.$b['count'].' → '.($b['points'] > 0 ? '+' : '').$b['points'])->implode("\n");
            $this->m->tell(self::KEY, $r->user, "Your points for $label: {$r->points} (rank {$r->rank} of {$rows->count()})", $lines ?: 'No activity recorded.', '/app/staff-points', false);
        }

        return $rows->count();
    }
}
