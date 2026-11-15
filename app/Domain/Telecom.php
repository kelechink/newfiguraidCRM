<?php

namespace App\Domain;

use Carbon\CarbonImmutable;
use InvalidArgumentException;

/** Telecom rating, margins, cycles and rate-sheet parsing (plain code, never AI). */
final class Telecom
{
    public static function r4(float $n): float
    {
        return round($n + PHP_FLOAT_EPSILON, 4);
    }

    /** Billable seconds for one call under first/next increments (e.g. 60/60, 1/1, 30/6). */
    public static function billSeconds(float $duration, int $first, int $next): float
    {
        if ($duration <= 0) {
            return 0;
        }
        if ($first < 1 || $next < 1) {
            throw new InvalidArgumentException('Increments must be at least 1 second');
        }
        if ($duration <= $first) {
            return $first;
        }

        return $first + ceil(($duration - $first) / $next) * $next;
    }

    /** Billed minutes for aggregated traffic: applies increments to the average call when call count is known. */
    public static function billedMinutes(float $rawSeconds, ?int $calls, int $first, int $next): float
    {
        if ($rawSeconds <= 0) {
            return 0;
        }
        if (! $calls) {
            return self::r4(self::billSeconds($rawSeconds, $first, $next) / 60);
        }

        return self::r4($calls * self::billSeconds($rawSeconds / $calls, $first, $next) / 60);
    }

    public static function margin(float $revenue, float $cost): array
    {
        $m = self::r4($revenue - $cost);

        return ['revenue' => self::r4($revenue), 'cost' => self::r4($cost), 'margin' => $m, 'margin_pct' => $revenue > 0 ? round($m / $revenue * 100, 2) : null];
    }

    public static function marginAlert(array $m, float $thresholdPct): ?string
    {
        if ($m['margin'] < 0) {
            return 'negative';
        }

        return $m['margin_pct'] !== null && $m['margin_pct'] < $thresholdPct ? 'thin' : null;
    }

    /** Sell-rate guard: hard block below cost and below the minimum margin. Returns problems found. */
    public static function checkSellRate(float $sell, ?float $buy, float $minMarginPct): ?string
    {
        if ($buy === null) {
            return null;
        }
        if ($sell < $buy) {
            return 'below_cost';
        }
        $pct = $sell > 0 ? ($sell - $buy) / $sell * 100 : 0;

        return $pct + 1e-9 < $minMarginPct ? 'below_min_margin' : null;
    }

    /** Sell price that hits a target margin on revenue. */
    public static function priceFor(float $buy, float $targetMarginPct): float
    {
        // rounded UP at 6 decimals so rounding never takes the margin below target
        return ceil(round($buy / (1 - $targetMarginPct / 100) * 1e6, 3)) / 1e6;
    }

    public static function asrAcd(?int $attempts, ?int $connected, float $rawSeconds): array
    {
        return [
            'asr' => $attempts && $connected !== null ? round($connected / $attempts * 100, 2) : null,
            'acd' => $connected ? round($rawSeconds / 60 / $connected, 2) : null,
        ];
    }

    /** Parse "7/3" style terms: [cycleDays, paymentDays]. */
    public static function terms(string $label): array
    {
        [$c, $p] = array_map('intval', explode('/', $label) + [7, 3]);

        return [max(1, $c), max(0, $p)];
    }

    /** The cycle containing $at, counted from $anchor. End exclusive. */
    public static function cycleFor(CarbonImmutable $anchor, int $days, CarbonImmutable $at): array
    {
        $a = $anchor->startOfDay();
        $n = (int) floor($a->diffInDays($at->startOfDay(), false) / $days);
        $start = $a->addDays($n * $days);

        return [$start, $start->addDays($days)];
    }

    public static function lastClosedCycle(CarbonImmutable $anchor, int $days, CarbonImmutable $now): array
    {
        [$start] = self::cycleFor($anchor, $days, $now);

        return [$start->subDays($days), $start];
    }

    /** Postpaid exposure vs credit limit: warning at 80%, over at 100%. */
    public static function creditState(float $exposure, ?float $limit): string
    {
        if (! $limit || $limit <= 0) {
            return 'ok';
        }

        return $exposure >= $limit ? 'over' : ($exposure >= $limit * 0.8 ? 'warning' : 'ok');
    }

    /** Longest-prefix match of a dialled number. */
    public static function matchPrefix(string $number, iterable $routes): mixed
    {
        $digits = preg_replace('/^00/', '', preg_replace('/\D/', '', $number));
        $best = null;
        foreach ($routes as $r) {
            $p = is_array($r) ? $r['prefix'] : $r->prefix;
            if (str_starts_with($digits, $p) && (! $best || strlen($p) > strlen(is_array($best) ? $best['prefix'] : $best->prefix))) {
                $best = $r;
            }
        }

        return $best;
    }

    private static function header(string $h): string
    {
        return trim(preg_replace('/[^a-z0-9]+/', '_', strtolower(trim($h))), '_');
    }

    private static function columns(array $head, array $wanted): array
    {
        $norm = array_map([self::class, 'header'], $head);
        $idx = [];
        foreach ($wanted as $k => $aliases) {
            $found = -1;
            foreach ($norm as $i => $h) {
                if (in_array($h, $aliases, true)) {
                    $found = $i;
                    break;
                }
            }
            $idx[$k] = $found;
        }

        return $idx;
    }

    /**
     * Normalise a vendor rate sheet (rows from CSV/Excel). Columns in any order with common aliases.
     *
     * @param  array<array<int,string>>  $table  first row = header
     */
    public static function parseRateDeck(array $table): array
    {
        $head = array_shift($table);
        if (! $head) {
            return ['rows' => [], 'errors' => [['line' => 1, 'message' => 'The file is empty']]];
        }
        $c = self::columns($head, [
            'prefix' => ['prefix', 'code', 'dial_code', 'dialcode', 'codes', 'dialing_code', 'country_code'],
            'destination' => ['destination', 'country', 'description', 'name', 'dest', 'zone'],
            'rate' => ['rate', 'price', 'rate_per_min', 'rate_min', 'usd_min', 'per_minute', 'new_rate', 'cost'],
            'effective' => ['effective', 'effective_date', 'effective_from', 'date', 'valid_from'],
        ]);
        $missing = array_keys(array_filter(['prefix' => $c['prefix'], 'rate' => $c['rate']], fn ($v) => $v < 0));
        if ($missing) {
            return ['rows' => [], 'errors' => [['line' => 1, 'message' => 'Missing column: '.implode(', ', $missing)]]];
        }
        $rows = $errors = $seen = [];
        foreach (array_values($table) as $i => $r) {
            $line = $i + 2;
            if (! array_filter($r, fn ($v) => trim((string) $v) !== '')) {
                continue;
            }
            $prefix = preg_replace('/\D/', '', (string) ($r[$c['prefix']] ?? ''));
            $rateStr = preg_replace('/[^0-9.]/', '', (string) ($r[$c['rate']] ?? ''));
            if ($prefix === '') {
                $errors[] = ['line' => $line, 'message' => 'No prefix'];

                continue;
            }
            if ($rateStr === '' || ! is_numeric($rateStr) || (float) $rateStr > 100) {
                $errors[] = ['line' => $line, 'message' => 'Bad rate "'.($r[$c['rate']] ?? '').'"'];

                continue;
            }
            if (isset($seen[$prefix])) {
                $errors[] = ['line' => $line, 'message' => "Duplicate prefix $prefix"];

                continue;
            }
            $seen[$prefix] = true;
            $eff = $c['effective'] >= 0 ? trim((string) ($r[$c['effective']] ?? '')) : '';
            $effective = null;
            if ($eff !== '') {
                try {
                    $effective = CarbonImmutable::parse($eff)->toDateString();
                } catch (\Throwable) {
                    $errors[] = ['line' => $line, 'message' => "Bad date \"$eff\""];

                    continue;
                }
            }
            $rows[] = ['line' => $line, 'prefix' => $prefix, 'destination' => $c['destination'] >= 0 ? trim((string) ($r[$c['destination']] ?? '')) : '', 'rate' => (float) $rateStr, 'effective_from' => $effective];
        }

        return ['rows' => $rows, 'errors' => $errors];
    }

    /** Compare a new vendor deck with the previous one: increases, decreases, new and removed prefixes. */
    public static function compareDecks(array $old, array $new): array
    {
        $o = array_column($old, 'rate', 'prefix');
        $n = array_column($new, 'rate', 'prefix');
        $out = ['increase' => [], 'decrease' => [], 'new' => [], 'removed' => []];
        foreach ($n as $p => $r) {
            if (! array_key_exists($p, $o)) {
                $out['new'][] = (string) $p;
            } elseif ($r > $o[$p]) {
                $out['increase'][] = (string) $p;
            } elseif ($r < $o[$p]) {
                $out['decrease'][] = (string) $p;
            }
        }
        $out['removed'] = array_map('strval', array_values(array_diff(array_keys($o), array_keys($n))));

        return $out;
    }

    /** Neutralise spreadsheet formula injection in exported cells. */
    public static function csvCell(mixed $v): string
    {
        $s = (string) $v;

        return preg_match('/^[=+\-@\t\r]/', $s) ? "'".$s : $s;
    }
}
