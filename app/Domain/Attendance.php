<?php

namespace App\Domain;

use Carbon\CarbonImmutable;

/**
 * Attendance rules (pure; no database). Company rules:
 * - Mon–Fri 09:00–17:00 Africa/Lagos. Any second after 09:00 is late (no grace).
 * - Signing off before 17:00 is an early departure.
 * - No accepted clock-in on a past working day = absent. Clocked in but never out = no-show (absent).
 * - Only punches inside the office geofence count, unless remote-allowed or manager-approved.
 */
final class Attendance
{
    public const TZ = 'Africa/Lagos';

    public const MAX_ACCURACY_M = 150;

    public const MAX_SKEW_S = 300;

    public const LATE_SYNC_S = 43200;

    public const FLAG_LABEL = [
        'out_of_range' => 'Outside the office geofence',
        'low_accuracy' => 'GPS accuracy too low to confirm',
        'no_location' => 'No location shared',
        'unknown_device' => 'Not their registered phone',
        'no_selfie' => 'No selfie',
        'selfie_reused' => 'Selfie identical to an earlier one',
        'suspect_location' => 'Location looks spoofed',
        'clock_skew' => "Phone clock doesn't match server time",
        'late_sync' => 'Offline clock-in synced over 12 hours later',
        'remote' => 'Remote clock-in (allowed for this person)',
    ];

    public static function haversine(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $r = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $h = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return 2 * $r * asin(sqrt($h));
    }

    /**
     * @param  array{lat:float,lng:float,radius:int}|null  $office
     * @param  array{lat:float,lng:float,accuracy:float}|null  $loc
     * @return array{distance:?float, within:bool, flags:string[], needsReview:bool}
     */
    public static function evaluatePunch(?array $office, ?array $loc, bool $deviceTrusted, bool $hasSelfie, bool $selfieReused, int $deviceTs, int $serverTs, bool $wasOffline = false, bool $identicalToPrevious = false, bool $remoteAllowed = false): array
    {
        $flags = [];
        $distance = null;
        $within = false;
        if (! $loc) {
            $flags[] = 'no_location';
        } elseif ($office) {
            $distance = round(self::haversine($loc['lat'], $loc['lng'], $office['lat'], $office['lng']), 1);
            $within = $distance <= $office['radius'];
            if (! $within) {
                $flags[] = $remoteAllowed ? 'remote' : 'out_of_range';
            }
            if ($loc['accuracy'] > max(self::MAX_ACCURACY_M, $office['radius'] * 1.5)) {
                $flags[] = 'low_accuracy';
            }
            if ($loc['accuracy'] < 1 || $identicalToPrevious) {
                $flags[] = 'suspect_location';
            }
        }
        if (! $deviceTrusted) {
            $flags[] = 'unknown_device';
        }
        if (! $hasSelfie) {
            $flags[] = 'no_selfie';
        }
        if ($selfieReused) {
            $flags[] = 'selfie_reused';
        }
        $skew = abs($serverTs - $deviceTs);
        if ($wasOffline) {
            if ($skew > self::LATE_SYNC_S) {
                $flags[] = 'late_sync';
            }
        } elseif ($skew > self::MAX_SKEW_S) {
            $flags[] = 'clock_skew';
        }

        return ['distance' => $distance, 'within' => $within, 'flags' => $flags, 'needsReview' => (bool) array_diff($flags, ['remote'])];
    }

    /** A punch counts only if not rejected and inside the geofence, remote-allowed, or approved on review. */
    public static function countsForAttendance(string $reviewStatus, bool $within, bool $remoteAllowed): bool
    {
        return $reviewStatus !== 'rejected' && ($within || $remoteAllowed || $reviewStatus === 'approved');
    }

    /**
     * @param  array{resume:string, close:string, grace:int, days:int[]}  $schedule
     * @param  array<array{type:string, at:CarbonImmutable, accepted:bool}>  $punches
     */
    public static function computeDay(string $date, string $today, array $schedule, array $punches, bool $onLeave, bool $holiday, ?CarbonImmutable $now = null): array
    {
        $day = CarbonImmutable::parse($date, self::TZ);
        $working = in_array($day->isoWeekday(), $schedule['days'], true);
        $start = $working ? CarbonImmutable::parse("$date {$schedule['resume']}", self::TZ) : null;
        $end = $working ? CarbonImmutable::parse("$date {$schedule['close']}", self::TZ) : null;
        $ok = array_values(array_filter($punches, fn ($p) => $p['accepted']));
        usort($ok, fn ($a, $b) => $a['at']->getTimestamp() <=> $b['at']->getTimestamp());
        $ins = array_values(array_filter($ok, fn ($p) => $p['type'] === 'in'));
        $outs = array_values(array_filter($ok, fn ($p) => $p['type'] === 'out'));
        $firstIn = $ins[0]['at'] ?? null;
        $lastOut = $outs ? end($outs)['at'] : null;

        $worked = 0;
        $open = null;
        foreach ($ok as $p) {
            if ($p['type'] === 'in' && ! $open) {
                $open = $p['at'];
            } elseif ($p['type'] === 'out' && $open) {
                $worked += ($p['at']->getTimestamp() - $open->getTimestamp()) / 60;
                $open = null;
            }
        }
        if ($open && $date === $today) {
            $worked += (($now ?? CarbonImmutable::now())->getTimestamp() - $open->getTimestamp()) / 60;
        }
        $base = ['first_in_at' => $firstIn, 'last_out_at' => $lastOut, 'worked_minutes' => max(0, (int) round($worked)), 'minutes_late' => 0, 'minutes_early' => 0, 'missing_clock_out' => false];

        if ($holiday) {
            return ['status' => 'holiday'] + $base;
        }
        if ($onLeave) {
            return ['status' => 'on_leave'] + $base;
        }
        if (! $working) {
            return ['status' => $firstIn ? 'present' : 'weekend'] + $base;
        }
        if (! $firstIn) {
            return ['status' => $date < $today ? 'absent' : 'pending'] + $base;
        }
        $lateBy = (int) ceil(($firstIn->getTimestamp() - $start->getTimestamp()) / 60);
        $late = $lateBy > $schedule['grace'];
        $last = end($ok);
        $signedOff = $last['type'] === 'out';
        if (! $signedOff && $date < $today) {
            return ['status' => 'absent', 'missing_clock_out' => true] + $base;
        }
        $earlyBy = $signedOff ? (int) ceil(($end->getTimestamp() - $last['at']->getTimestamp()) / 60) : 0;

        return ['status' => $late ? 'late' : 'present', 'minutes_late' => $late ? $lateBy : 0, 'minutes_early' => max(0, $earlyBy)] + $base;
    }

    /** Working dates in a month (YYYY-MM) on the given ISO weekdays, minus holidays. */
    public static function workingDaysInMonth(string $month, array $days, array $holidays = []): array
    {
        $d = CarbonImmutable::parse("$month-01", 'UTC');
        $out = [];
        while ($d->format('Y-m') === $month) {
            $iso = $d->toDateString();
            if (in_array($d->isoWeekday(), $days, true) && ! in_array($iso, $holidays, true)) {
                $out[] = $iso;
            }
            $d = $d->addDay();
        }

        return $out;
    }
}
