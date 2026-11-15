<?php

namespace App\Services;

use App\Domain\Attendance;
use App\Domain\Payroll;
use App\Models\AttendanceDay;
use App\Models\AttendancePunch;
use App\Models\Deduction;
use App\Models\Device;
use App\Models\LatenessPolicy;
use App\Models\LeaveRequest;
use App\Models\Office;
use App\Models\PublicHoliday;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class AttendanceService
{
    public static function today(): string
    {
        return CarbonImmutable::now(Attendance::TZ)->toDateString();
    }

    public static function schedule(User $u): array
    {
        $p = $u->staffProfile;

        return ['resume' => $p->resume_time ?? '09:00', 'close' => $p->close_time ?? '17:00', 'grace' => (int) ($p->grace_minutes ?? 0), 'days' => array_map('intval', $p->working_days ?? [1, 2, 3, 4, 5])];
    }

    /** Record a clock-in/out from the phone page. Returns the punch with its verdict. */
    public function punch(User $u, string $type, ?float $lat, ?float $lng, ?float $accuracy, ?string $fingerprint, ?string $selfieFileId, ?string $selfieHash, ?int $deviceTs, string $ip): AttendancePunch
    {
        $profile = $u->staffProfile;
        $office = $profile?->office ?? Office::where('is_active', true)->first();
        $device = $fingerprint ? Device::firstOrCreate(['user_id' => $u->id, 'fingerprint' => hash('sha256', $fingerprint)], ['label' => substr(request()->userAgent() ?? 'Phone', 0, 120), 'status' => Device::where('user_id', $u->id)->exists() ? 'pending' : 'approved']) : null;
        $reused = $selfieHash && DB::table('stored_files')->where('sha256', $selfieHash)->where('purpose', 'selfie')->where('id', '!=', $selfieFileId)->exists();
        $prev = AttendancePunch::where('user_id', $u->id)->latest('server_time')->first();
        $identical = $prev && $lat !== null && abs($prev->latitude - $lat) < 1e-7 && abs($prev->longitude - $lng) < 1e-7;
        $v = Attendance::evaluatePunch(
            $office ? ['lat' => (float) $office->latitude, 'lng' => (float) $office->longitude, 'radius' => $office->radius_m] : null,
            $lat !== null ? ['lat' => $lat, 'lng' => $lng, 'accuracy' => $accuracy ?? 9999] : null,
            $device?->status === 'approved', (bool) $selfieFileId, $reused, $deviceTs ?? time(), time(), false, $identical, (bool) $profile?->remote_allowed,
        );
        $date = self::today();
        $day = AttendanceDay::firstOrCreate(['user_id' => $u->id, 'date' => $date]);
        $punch = AttendancePunch::forceCreate([
            'attendance_day_id' => $day->id, 'user_id' => $u->id, 'type' => $type, 'device_time' => $deviceTs ? CarbonImmutable::createFromTimestamp($deviceTs) : now(),
            'server_time' => now(), 'latitude' => $lat, 'longitude' => $lng, 'accuracy_m' => $accuracy ? (int) min(65535, $accuracy) : null, 'distance_m' => $v['distance'],
            'within_geofence' => $v['within'], 'office_id' => $office?->id, 'selfie_file_id' => $selfieFileId, 'device_id' => $device?->id, 'flags' => $v['flags'],
            'review_status' => $v['needsReview'] ? 'pending' : 'not_required', 'ip' => $ip,
        ]);
        $this->recompute($u, $date);

        return $punch;
    }

    public function recompute(User $u, string $date): AttendanceDay
    {
        $day = AttendanceDay::firstOrCreate(['user_id' => $u->id, 'date' => $date]);
        if ($day->payroll_locked_at) {
            return $day;
        }
        $remote = (bool) $u->staffProfile?->remote_allowed;
        $punches = AttendancePunch::where('attendance_day_id', $day->id)->get()->map(fn ($p) => [
            'type' => $p->type, 'at' => CarbonImmutable::parse($p->server_time), 'accepted' => Attendance::countsForAttendance($p->review_status, $p->within_geofence, $remote),
        ])->all();
        $onLeave = LeaveRequest::where('user_id', $u->id)->where('status', 'approved')->whereDate('start_date', '<=', $date)->whereDate('end_date', '>=', $date)->exists();
        $holiday = PublicHoliday::whereDate('date', $date)->exists();
        $r = Attendance::computeDay($date, self::today(), self::schedule($u), $punches, $onLeave, $holiday);
        $day->fill([
            'status' => $r['status'], 'first_in_at' => $r['first_in_at'], 'last_out_at' => $r['last_out_at'], 'minutes_late' => $r['minutes_late'],
            'minutes_early' => $r['minutes_early'], 'missing_clock_out' => $r['missing_clock_out'], 'worked_minutes' => $r['worked_minutes'],
            'is_flagged' => AttendancePunch::where('attendance_day_id', $day->id)->where('review_status', 'pending')->exists(),
        ])->save();
        app(Whiteboard::class)->reconcileDay($day);

        return $day;
    }

    public static function policyRule(User $u): array
    {
        $p = LatenessPolicy::where(fn ($q) => $q->whereNull('unit_id')->orWhere('unit_id', $u->primary_unit_id))->where('effective_from', '<=', today())->orderByRaw('unit_id is null')->orderByDesc('effective_from')->first();

        return [
            'lateness_mode' => $p->lateness_mode ?? 'fixed', 'fixed_amount' => (float) ($p->fixed_amount ?? 500), 'tiers' => $p->tiers ?? [],
            'early_leave_amount' => (float) ($p->early_leave_amount ?? 500), 'absence_mode' => $p->absence_mode ?? 'fixed', 'absence_amount' => (float) ($p->absence_amount ?? 3000),
            'monthly_cap_amount' => $p?->monthly_cap_amount !== null ? (float) $p->monthly_cap_amount : null, 'monthly_cap_pct' => $p?->monthly_cap_pct !== null ? (float) $p->monthly_cap_pct : null,
        ];
    }

    /** Rebuild a month's attendance deductions for one person (idempotent; waived lines are kept). */
    public function deductionsForMonth(User $u, string $month): array
    {
        $holidays = PublicHoliday::where('date', 'like', "$month%")->pluck('date')->map(fn ($d) => substr((string) $d, 0, 10))->all();
        $sched = self::schedule($u);
        $workDays = Attendance::workingDaysInMonth($month, $sched['days'], $holidays);
        foreach ($workDays as $d) {
            if ($d < self::today()) {
                $start = $u->staffProfile?->start_date?->toDateString();
                if (! $start || $d >= $start) {
                    $this->recompute($u, $d);
                }
            }
        }
        $days = AttendanceDay::where('user_id', $u->id)->where('date', 'like', "$month%")->withExists(['excuses as excused' => fn ($q) => $q->where('status', 'approved')])->get()
            ->map(fn ($d) => ['date' => $d->date->toDateString(), 'day_id' => $d->id, 'status' => $d->status, 'minutes_late' => $d->minutes_late, 'minutes_early' => $d->minutes_early, 'missing_clock_out' => $d->missing_clock_out, 'excused' => (bool) $d->excused])->all();
        $gross = (float) ($u->staffProfile?->salary ?? 0);
        $res = Payroll::attendanceDeductions(self::policyRule($u), $gross, count($workDays), $days);
        DB::transaction(function () use ($u, $month, $res) {
            Deduction::where('user_id', $u->id)->where('period_month', $month)->whereIn('type', ['lateness', 'early_departure', 'absence'])->where('status', '!=', 'waived')->whereNull('payslip_id')->delete();
            $waived = Deduction::where('user_id', $u->id)->where('period_month', $month)->where('status', 'waived')->get(['attendance_day_id', 'type'])->map(fn ($w) => "$w->attendance_day_id:$w->type")->all();
            foreach ($res['items'] as $l) {
                if (in_array("{$l['day_id']}:{$l['type']}", $waived, true)) {
                    continue;
                }
                Deduction::create(['user_id' => $u->id, 'attendance_day_id' => $l['day_id'], 'type' => $l['type'], 'amount' => $l['amount'], 'reason' => $l['reason'], 'status' => $l['status'], 'period_month' => $month]);
            }
        });

        return $res;
    }
}
