<?php

namespace Tests\Unit;

use App\Domain\Attendance;
use App\Domain\Payroll;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

/** Company rules: late after 09:00 = ₦500, early sign-off = ₦500, absent = ₦3,000, missed clock-out = no-show, no cap. */
class PayrollRulesTest extends TestCase
{
    private array $rule = ['lateness_mode' => 'fixed', 'fixed_amount' => 500, 'tiers' => [], 'early_leave_amount' => 500, 'absence_mode' => 'fixed', 'absence_amount' => 3000, 'monthly_cap_amount' => null, 'monthly_cap_pct' => null];

    private array $sched = ['resume' => '09:00', 'close' => '17:00', 'grace' => 0, 'days' => [1, 2, 3, 4, 5]];

    private function at(string $dt): CarbonImmutable
    {
        return CarbonImmutable::parse($dt, Attendance::TZ);
    }

    private function day(string $date, array $punches, string $today = '2026-11-20'): array
    {
        return Attendance::computeDay($date, $today, $this->sched, array_map(fn ($p) => ['type' => $p[0], 'at' => $this->at("$date {$p[1]}"), 'accepted' => $p[2] ?? true], $punches), false, false);
    }

    public function test_one_second_after_nine_is_late(): void
    {
        $this->assertSame('present', $this->day('2026-11-16', [['in', '09:00:00'], ['out', '17:00:00']])['status']);
        $d = $this->day('2026-11-16', [['in', '09:00:01'], ['out', '17:00:00']]);
        $this->assertSame('late', $d['status']);
        $this->assertSame(1, $d['minutes_late']);
    }

    public function test_leaving_before_five_is_early_departure(): void
    {
        $d = $this->day('2026-11-16', [['in', '08:55'], ['out', '16:59']]);
        $this->assertSame('present', $d['status']);
        $this->assertSame(1, $d['minutes_early']);
    }

    public function test_missed_clock_out_is_a_no_show_absence(): void
    {
        $d = $this->day('2026-11-16', [['in', '08:50']]);
        $this->assertSame('absent', $d['status']);
        $this->assertTrue($d['missing_clock_out']);
        $this->assertSame('pending', $this->day('2026-11-20', [], '2026-11-20')['status']);
    }

    public function test_punches_outside_the_office_do_not_count(): void
    {
        $this->assertFalse(Attendance::countsForAttendance('pending', false, false));
        $this->assertTrue(Attendance::countsForAttendance('approved', false, false));
        $this->assertTrue(Attendance::countsForAttendance('not_required', true, false));
        $this->assertFalse(Attendance::countsForAttendance('rejected', true, false));
        $d = $this->day('2026-11-16', [['in', '08:50', false], ['out', '17:05', false]]);
        $this->assertSame('absent', $d['status']);
    }

    public function test_weekend_and_leave_are_never_charged(): void
    {
        $this->assertSame('weekend', $this->day('2026-11-15', [])['status']);
        $r = Attendance::computeDay('2026-11-16', '2026-11-20', $this->sched, [], true, false);
        $this->assertSame('on_leave', $r['status']);
    }

    public function test_deductions_late_and_early_same_day_absence_and_no_cap(): void
    {
        $days = [
            ['date' => '2026-11-02', 'status' => 'late', 'minutes_late' => 12, 'minutes_early' => 30, 'excused' => false],
            ['date' => '2026-11-03', 'status' => 'absent', 'minutes_late' => 0, 'excused' => false],
            ['date' => '2026-11-04', 'status' => 'absent', 'minutes_late' => 0, 'missing_clock_out' => true, 'excused' => false],
            ['date' => '2026-11-05', 'status' => 'absent', 'minutes_late' => 0, 'excused' => true],
            ['date' => '2026-11-06', 'status' => 'on_leave', 'minutes_late' => 0, 'excused' => false],
        ];
        foreach (range(9, 27) as $d) {
            $days[] = ['date' => sprintf('2026-11-%02d', $d), 'status' => 'late', 'minutes_late' => 5, 'excused' => false];
        }
        $r = Payroll::attendanceDeductions($this->rule, 300000, 21, $days);
        $this->assertNull($r['cap']);
        $types = array_count_values(array_column($r['items'], 'type'));
        $this->assertSame(20, $types['lateness']);
        $this->assertSame(1, $types['early_departure']);
        $this->assertSame(2, $types['absence']);
        $this->assertEquals(20 * 500 + 500 + 2 * 3000, $r['total']);
        $this->assertStringContainsString('No-show', collect($r['items'])->firstWhere('date', '2026-11-04')['reason']);
    }

    public function test_payslip_paye_pension_and_attendance(): void
    {
        $b = Payroll::payslip(['base' => 300000, 'allowances' => [['name' => 'Housing', 'amount' => 100000], ['name' => 'Transport', 'amount' => 50000]], 'bonuses' => [], 'attendance' => 3500, 'other' => [], 'paye' => true, 'pension_pct' => 8, 'nhf_pct' => 0]);
        $this->assertEquals(450000, $b['gross']);
        $this->assertEquals(36000, collect($b['statutory'])->firstWhere('name', 'Pension (8%)')['amount']);
        $this->assertEquals(Payroll::ATTENDANCE_LINE, $b['deductions'][0]['name']);
        $this->assertEqualsWithDelta($b['gross'] - $b['total_deductions'], $b['net'], 0.001);
        $this->assertSame(0.0, Payroll::annualPaye(800000));
        $this->assertEquals(330000, Payroll::annualPaye(3000000));
    }

    public function test_geofence_100m_at_kano_house(): void
    {
        $office = ['lat' => 9.051622, 'lng' => 7.496790, 'radius' => 100];
        $in = Attendance::evaluatePunch($office, ['lat' => 9.0520, 'lng' => 7.4970, 'accuracy' => 15], true, true, false, time(), time());
        $this->assertTrue($in['within']);
        $this->assertFalse($in['needsReview']);
        $out = Attendance::evaluatePunch($office, ['lat' => 9.0600, 'lng' => 7.4968, 'accuracy' => 15], true, true, false, time(), time());
        $this->assertFalse($out['within']);
        $this->assertContains('out_of_range', $out['flags']);
    }
}
