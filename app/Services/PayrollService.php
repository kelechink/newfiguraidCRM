<?php

namespace App\Services;

use App\Domain\Attendance;
use App\Domain\Payroll;
use App\Models\AttendanceDay;
use App\Models\Deduction;
use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\PublicHoliday;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/** Payroll runs: prepare (Finance) → approve → sign off (Super Admin) → paid. Plain code, never AI. */
class PayrollService
{
    public function prepare(PayrollRun $run): PayrollRun
    {
        if (! in_array($run->status, ['draft', 'in_review'], true)) {
            throw new RuntimeException('Only draft runs can be recalculated.');
        }
        $month = $run->period_month;
        $att = app(AttendanceService::class);
        $holidays = PublicHoliday::where('date', 'like', "$month%")->pluck('date')->map(fn ($d) => substr((string) $d, 0, 10))->all();
        $gross = $net = 0;
        $count = 0;
        DB::transaction(function () use ($run, $month, $att, $holidays, &$gross, &$net, &$count) {
            $run->payslips()->delete();
            User::whereIn('status', ['active', 'onboarding'])->whereHas('staffProfile')->with('staffProfile')->each(function (User $u) use ($run, $month, $att, $holidays, &$gross, &$net, &$count) {
                $p = $u->staffProfile;
                if (! $p->salary) {
                    return;
                }
                $att->deductionsForMonth($u, $month);
                $attendance = (float) Deduction::where('user_id', $u->id)->where('period_month', $month)->whereIn('type', ['lateness', 'early_departure', 'absence'])->where('status', '!=', 'waived')->sum('amount');
                $other = Deduction::where('user_id', $u->id)->where('period_month', $month)->whereNotIn('type', ['lateness', 'early_departure', 'absence'])->where('status', 'active')->get()->map(fn ($d) => ['name' => $d->reason, 'amount' => (float) $d->amount])->all();
                $days = Attendance::workingDaysInMonth($month, array_map('intval', $p->working_days ?? [1, 2, 3, 4, 5]), $holidays);
                $k = Payroll::proRata($days, $p->start_date?->toDateString(), null);
                $b = Payroll::payslip([
                    'base' => (float) $p->salary, 'allowances' => array_map(fn ($a) => ['name' => $a['name'], 'amount' => (float) $a['amount']], $p->allowances ?? []), 'bonuses' => [],
                    'attendance' => $attendance, 'other' => $other, 'paye' => (bool) Setting::get('payroll.paye', true),
                    'pension_pct' => (float) Setting::get('payroll.pension_pct', 8), 'nhf_pct' => (float) Setting::get('payroll.nhf_pct', 0), 'pro_rata' => $k,
                ]);
                $slip = Payslip::create(['payroll_run_id' => $run->id, 'user_id' => $u->id, 'breakdown' => $b, 'net_pay' => (string) $b['net']]);
                Deduction::where('user_id', $u->id)->where('period_month', $month)->where('status', '!=', 'waived')->update(['payslip_id' => $slip->id]);
                $gross += $b['gross'];
                $net += $b['net'];
                $count++;
            });
            $run->forceFill(['status' => 'in_review', 'total_gross' => (string) round($gross, 2), 'total_net' => (string) round($net, 2), 'staff_count' => $count])->save();
        });

        return $run->fresh();
    }

    public function approve(PayrollRun $run, User $by): void
    {
        if ($run->status !== 'in_review') {
            throw new RuntimeException('Prepare the run first.');
        }
        if ($run->prepared_by_id === $by->id && ! $by->isRole('super_admin')) {
            throw new RuntimeException('The person who prepared payroll cannot approve it.');
        }
        $run->forceFill(['status' => 'approved', 'approved_by_id' => $by->id, 'approved_at' => now()])->save();
        AttendanceDay::where('date', 'like', "$run->period_month%")->update(['payroll_locked_at' => now()]);
    }

    public function signOff(PayrollRun $run, User $by): void
    {
        if ($run->status !== 'approved') {
            throw new RuntimeException('Payroll must be approved first.');
        }
        $run->forceFill(['status' => 'signed_off', 'signed_off_by_id' => $by->id, 'signed_off_at' => now()])->save();
    }
}
