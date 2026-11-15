<?php

namespace App\Domain;

use Carbon\CarbonImmutable;

/** Deductions and payslips (plain code, never AI). Money in naira, rounded to kobo. */
final class Payroll
{
    public const ATTENDANCE_LINE = 'Lateness, early sign-off & absence';

    /** Annual PAYE bands (Nigeria Tax Act 2025, from 2026). Verify with your tax adviser. */
    public const PAYE_BANDS = [[800000, 0], [3000000, 0.15], [12000000, 0.18], [25000000, 0.21], [50000000, 0.23], [null, 0.25]];

    public static function r2(float $n): float
    {
        return round($n + PHP_FLOAT_EPSILON, 2);
    }

    /** @param array{lateness_mode:string, fixed_amount:?float, tiers:?array, early_leave_amount:?float, absence_mode:string, absence_amount:?float, monthly_cap_amount:?float, monthly_cap_pct:?float} $rule */
    public static function latenessCharge(array $rule, int $minutesLate): array
    {
        if ($minutesLate <= 0) {
            return [0.0, ''];
        }
        if ($rule['lateness_mode'] === 'fixed') {
            return [self::r2((float) ($rule['fixed_amount'] ?? 0)), 'flat rate'];
        }
        $tiers = $rule['tiers'] ?? [];
        usort($tiers, fn ($a, $b) => $a['from'] <=> $b['from']);
        foreach ($tiers as $t) {
            if ($minutesLate >= $t['from'] && ($t['to'] === null || $minutesLate <= $t['to'])) {
                return [self::r2((float) $t['amount']), $t['to'] === null ? "tier {$t['from']}+ min" : "tier {$t['from']}–{$t['to']} min"];
            }
        }

        return [0.0, 'below first tier'];
    }

    public static function absenceCharge(array $rule, float $gross, int $workingDays): float
    {
        if ($rule['absence_mode'] === 'fixed') {
            return self::r2((float) ($rule['absence_amount'] ?? 0));
        }

        return $workingDays > 0 ? self::r2($gross / $workingDays) : 0.0;
    }

    public static function monthlyCap(array $rule, float $gross): ?float
    {
        $caps = array_filter([$rule['monthly_cap_amount'] ?? null, isset($rule['monthly_cap_pct']) ? $gross * $rule['monthly_cap_pct'] / 100 : null], fn ($c) => $c !== null && $c >= 0);

        return $caps ? self::r2(min($caps)) : null;
    }

    /**
     * @param  array<array{date:string, day_id?:string, status:string, minutes_late:int, minutes_early?:int, missing_clock_out?:bool, excused:bool}>  $days
     * @return array{items: array, total: float, uncapped: float, cap: ?float}
     */
    public static function attendanceDeductions(array $rule, float $gross, int $workingDays, array $days): array
    {
        usort($days, fn ($a, $b) => strcmp($a['date'], $b['date']));
        $raw = [];
        foreach ($days as $d) {
            if ($d['excused']) {
                continue;
            }
            $label = CarbonImmutable::parse($d['date'])->format('D j M');
            if (in_array($d['status'], ['late', 'present'], true)) {
                if ($d['status'] === 'late') {
                    [$amt, $how] = self::latenessCharge($rule, $d['minutes_late']);
                    if ($amt > 0) {
                        $raw[] = ['date' => $d['date'], 'day_id' => $d['day_id'] ?? null, 'type' => 'lateness', 'amount' => $amt, 'reason' => "Late {$d['minutes_late']} min on $label ($how)", 'status' => 'active'];
                    }
                }
                if (($d['minutes_early'] ?? 0) > 0 && ! empty($rule['early_leave_amount'])) {
                    $raw[] = ['date' => $d['date'], 'day_id' => $d['day_id'] ?? null, 'type' => 'early_departure', 'amount' => self::r2((float) $rule['early_leave_amount']), 'reason' => "Signed off {$d['minutes_early']} min before close on $label", 'status' => 'active'];
                }
            } elseif ($d['status'] === 'absent') {
                $amt = self::absenceCharge($rule, $gross, $workingDays);
                if ($amt > 0) {
                    $why = ! empty($d['missing_clock_out']) ? "No-show on $label: clocked in but never clocked out at the office" : "Absent without approved leave or excuse on $label";
                    $raw[] = ['date' => $d['date'], 'day_id' => $d['day_id'] ?? null, 'type' => 'absence', 'amount' => $amt, 'reason' => $why, 'status' => 'active'];
                }
            }
        }
        $cap = self::monthlyCap($rule, $gross);
        $uncapped = self::r2(array_sum(array_column($raw, 'amount')));
        if ($cap === null || $uncapped <= $cap) {
            return ['items' => $raw, 'total' => $uncapped, 'uncapped' => $uncapped, 'cap' => $cap];
        }
        $left = $cap;
        foreach ($raw as &$l) {
            if ($left >= $l['amount']) {
                $left = self::r2($left - $l['amount']);

                continue;
            }
            $l['amount'] = self::r2(max(0, $left));
            $l['status'] = 'capped';
            $l['reason'] .= ' — reduced by the monthly cap';
            $left = 0;
        }

        return ['items' => $raw, 'total' => $cap, 'uncapped' => $uncapped, 'cap' => $cap];
    }

    public static function annualPaye(float $chargeable): float
    {
        $tax = 0;
        $floor = 0;
        foreach (self::PAYE_BANDS as [$upTo, $rate]) {
            if ($chargeable <= $floor) {
                break;
            }
            $top = $upTo ?? INF;
            $tax += (min($chargeable, $top) - $floor) * $rate;
            $floor = $top;
        }

        return self::r2($tax);
    }

    /**
     * @param  array{base:float, allowances:array, bonuses:array, attendance:float, other:array, paye:bool, pension_pct:float, nhf_pct:float, rent_relief?:float, pro_rata?:float}  $p
     */
    public static function payslip(array $p): array
    {
        $k = $p['pro_rata'] ?? 1;
        $base = self::r2($p['base'] * $k);
        $allow = array_map(fn ($a) => ['name' => $a['name'], 'amount' => self::r2($a['amount'] * $k), 'pensionable' => $a['pensionable'] ?? (bool) preg_match('/housing|transport/i', $a['name'])], $p['allowances']);
        $bonuses = array_map(fn ($b) => ['name' => $b['name'], 'amount' => self::r2($b['amount'])], $p['bonuses']);
        $gross = self::r2($base + array_sum(array_column($allow, 'amount')) + array_sum(array_column($bonuses, 'amount')));
        $pensionable = $base + array_sum(array_column(array_filter($allow, fn ($a) => $a['pensionable']), 'amount'));
        $pension = self::r2($pensionable * $p['pension_pct'] / 100);
        $nhf = self::r2($base * $p['nhf_pct'] / 100);
        $relief = ($p['rent_relief'] ?? 0) / 12;
        $paye = $p['paye'] ? self::r2(self::annualPaye(max(0, ($gross - $pension - $nhf - $relief) * 12)) / 12) : 0;
        $statutory = array_values(array_filter([
            $paye > 0 ? ['name' => 'PAYE', 'amount' => $paye] : null,
            $pension > 0 ? ['name' => "Pension ({$p['pension_pct']}%)", 'amount' => $pension] : null,
            $nhf > 0 ? ['name' => "NHF ({$p['nhf_pct']}%)", 'amount' => $nhf] : null,
        ]));
        $deductions = array_merge($p['attendance'] > 0 ? [['name' => self::ATTENDANCE_LINE, 'amount' => self::r2($p['attendance'])]] : [], array_values(array_map(fn ($o) => ['name' => $o['name'], 'amount' => self::r2($o['amount'])], array_filter($p['other'], fn ($o) => $o['amount'] > 0))));
        $total = self::r2(array_sum(array_column($statutory, 'amount')) + array_sum(array_column($deductions, 'amount')));

        return [
            'base' => $base, 'allowances' => array_map(fn ($a) => ['name' => $a['name'], 'amount' => $a['amount']], $allow), 'bonuses' => $bonuses,
            'gross' => $gross, 'statutory' => $statutory, 'deductions' => $deductions, 'total_deductions' => $total, 'net' => self::r2(max(0, $gross - $total)), 'pro_rata' => $k,
        ];
    }

    public static function proRata(array $workingDays, ?string $from, ?string $to): float
    {
        if (! $workingDays) {
            return 0;
        }
        $covered = count(array_filter($workingDays, fn ($d) => (! $from || $d >= $from) && (! $to || $d <= $to)));

        return round($covered / count($workingDays), 4);
    }
}
