<?php

namespace App\Domain;

use Carbon\CarbonImmutable;
use InvalidArgumentException;

/** Invoice maths, currency conversion, ageing, cash projection, runway, FX verification, bank matching. */
final class Money
{
    public const VAT_PCT = 7.5;

    public static function r2(float $n): float
    {
        return round($n + PHP_FLOAT_EPSILON, 2);
    }

    /** @param array<array{quantity:float, unit_price:float, vatable:bool}> $lines */
    public static function invoiceTotals(array $lines, float $vatPct = self::VAT_PCT, float $whtPct = 0): array
    {
        $amounts = array_map(fn ($l) => self::r2($l['quantity'] * $l['unit_price']), $lines);
        $subtotal = self::r2(array_sum($amounts));
        $vatable = 0;
        foreach ($lines as $i => $l) {
            $vatable += $l['vatable'] ? $amounts[$i] : 0;
        }
        $vat = self::r2($vatable * $vatPct / 100);
        $wht = self::r2($subtotal * $whtPct / 100);

        return ['lines' => $amounts, 'subtotal' => $subtotal, 'vat' => $vat, 'wht' => $wht, 'total' => self::r2($subtotal + $vat)];
    }

    public static function toNgn(float $amount, string $currency, ?float $rate): float
    {
        if ($currency === 'NGN') {
            return self::r2($amount);
        }
        if (! $rate || $rate <= 0) {
            throw new InvalidArgumentException("An exchange rate is required for $currency");
        }

        return self::r2($amount * $rate);
    }

    public static function ageBucket(CarbonImmutable $due, CarbonImmutable $asOf): string
    {
        $days = (int) floor(($asOf->getTimestamp() - $due->getTimestamp()) / 86400);

        return match (true) {
            $days <= 0 => 'current', $days <= 30 => '1-30', $days <= 60 => '31-60', $days <= 90 => '61-90', default => '90+',
        };
    }

    public static function invoiceStatus(float $total, float $paid, CarbonImmutable $due, CarbonImmutable $now, string $current): string
    {
        if (in_array($current, ['void', 'draft'], true)) {
            return $current;
        }
        if ($paid >= $total - 0.005) {
            return 'paid';
        }
        if ($paid > 0) {
            return $due->lt($now) ? 'overdue' : 'part_paid';
        }

        return $due->lt($now) ? 'overdue' : ($current === 'overdue' ? 'sent' : $current);
    }

    /**
     * Weekly cash projection. Flows: [date, amount (+in/−out NGN), kind, probability].
     * Scenario factors: best inflow ×1.25 prob, expected ×prob, worst ×0.75 (pipeline ×0.5) and outflows ×1.1.
     */
    public static function projectCash(float $opening, array $flows, string $scenario, string $start, int $weeks, float $minimum = 0): array
    {
        $factor = fn ($f) => match ($scenario) {
            'best' => $f['amount'] >= 0 ? min(1, $f['probability'] * 1.25) : 1,
            'worst' => $f['amount'] >= 0 ? ($f['kind'] === 'pipeline' ? $f['probability'] * 0.5 : $f['probability'] * 0.75) : 1.1,
            default => $f['amount'] >= 0 ? $f['probability'] : 1,
        };
        $balance = $opening;
        $out = [];
        $s = CarbonImmutable::parse($start);
        for ($w = 0; $w < $weeks; $w++) {
            $from = $s->addDays($w * 7)->toDateString();
            $to = $s->addDays(($w + 1) * 7)->toDateString();
            $in = $outf = 0;
            foreach ($flows as $f) {
                if (! ($w === 0 ? $f['date'] < $to : ($f['date'] >= $from && $f['date'] < $to))) {
                    continue;
                }
                $v = $f['amount'] * $factor($f);
                $v >= 0 ? $in += $v : $outf += -$v;
            }
            $balance += $in - $outf;
            $out[] = ['week_start' => $from, 'inflow' => self::r2($in), 'outflow' => self::r2($outf), 'closing' => self::r2($balance), 'below_minimum' => $balance < $minimum];
        }

        return $out;
    }

    /** Months of runway = cash ÷ average monthly net burn. Null when not burning. */
    public static function runwayMonths(float $cash, float $avgMonthlyIncome, float $avgMonthlyExpense): ?float
    {
        $burn = $avgMonthlyExpense - $avgMonthlyIncome;

        return $burn > 0 ? round($cash / $burn, 1) : null;
    }

    /** Debt payoff: months to clear at a fixed instalment with monthly compounding. Null if never. */
    public static function payoffMonths(float $outstanding, float $annualRatePct, float $instalment): ?int
    {
        $r = $annualRatePct / 1200;
        if ($instalment <= 0 || $instalment <= $outstanding * $r) {
            return $outstanding <= 0 ? 0 : null;
        }
        if ($r == 0) {
            return (int) ceil($outstanding / $instalment);
        }

        return (int) ceil(-log(1 - $r * $outstanding / $instalment) / log(1 + $r));
    }

    /**
     * Score a bank credit against an open invoice (0–100). Amount match is required; the invoice
     * number or customer name in the narration and date proximity raise confidence.
     */
    public static function matchScore(float $credit, string $narration, string $date, array $inv): int
    {
        $outstanding = $inv['outstanding'];
        if ($outstanding <= 0 || abs($credit - $outstanding) > max(1, $outstanding * 0.001)) {
            // allow 7.5% shortfall for WHT deducted at source
            if (! (abs($credit - ($outstanding - $inv['subtotal'] * 0.05)) < 1 || abs($credit - ($outstanding - $inv['subtotal'] * 0.1)) < 1)) {
                return 0;
            }
            $score = 45;
        } else {
            $score = 60;
        }
        $n = strtoupper($narration);
        if ($inv['number'] && str_contains($n, strtoupper($inv['number']))) {
            $score += 30;
        }
        if ($inv['customer'] && collect(preg_split('/\s+/', strtoupper($inv['customer'])))->filter(fn ($w) => strlen($w) > 3)->contains(fn ($w) => str_contains($n, $w))) {
            $score += 15;
        }
        $days = abs(CarbonImmutable::parse($date)->diffInDays(CarbonImmutable::parse($inv['issue_date'])));
        if ($days <= 45) {
            $score += 5;
        }

        return min(100, $score);
    }

    /** Pull a JSON object out of a model reply (tolerates fences/prose). */
    public static function extractJson(string $text): ?array
    {
        if (preg_match('/```(?:json)?\s*([\s\S]*?)```/', $text, $m)) {
            $raw = $m[1];
        } else {
            $a = strpos($text, '{');
            $b = strrpos($text, '}');
            $raw = $a !== false && $b !== false ? substr($text, $a, $b - $a + 1) : '';
        }
        $j = json_decode($raw, true);

        return is_array($j) ? $j : null;
    }

    /**
     * Accept an AI-found parallel-market rate only when ≥2 distinct recent sources agree within 3% of the
     * median, the value is in a sane band, and it moved ≤15% from yesterday. Rate = median sell price.
     *
     * @param  array<array{currency:string, buy:?float, sell:?float, source:string, published_on?:?string}>  $found
     */
    public static function judgeRates(array $found, array $previous, string $today, array $currencies = ['USD', 'EUR', 'GBP']): array
    {
        $median = function (array $xs) {
            sort($xs);
            $m = intdiv(count($xs), 2);

            return count($xs) % 2 ? $xs[$m] : ($xs[$m - 1] + $xs[$m]) / 2;
        };
        $out = [];
        foreach ($currencies as $cur) {
            $by = [];
            foreach ($found as $f) {
                if (($f['currency'] ?? '') !== $cur) {
                    continue;
                }
                $v = $f['sell'] ?? $f['buy'] ?? null;
                if (! is_numeric($v) || $v < 100 || $v > 20000) {
                    continue;
                }
                if (! empty($f['published_on'])) {
                    $age = (strtotime($today) - strtotime($f['published_on'])) / 86400;
                    if (! ($age >= -1 && $age <= 3)) {
                        continue;
                    }
                }
                $k = strtolower(trim($f['source'] ?? ''));
                if ($k !== '' && ! isset($by[$k])) {
                    $by[$k] = (float) $v;
                }
            }
            if (count($by) < 2) {
                $out[$cur] = ['rate' => null, 'accepted' => false, 'reason' => 'Only '.count($by).' recent source(s) found', 'sources' => array_keys($by)];

                continue;
            }
            $mid = $median(array_values($by));
            $agree = array_filter($by, fn ($v) => abs($v - $mid) / $mid <= 0.03);
            if (count($agree) < 2) {
                $out[$cur] = ['rate' => null, 'accepted' => false, 'reason' => 'Sources disagree', 'sources' => array_keys($by)];

                continue;
            }
            $rate = round($median(array_values($agree)), 2);
            $prev = $previous[$cur] ?? null;
            if ($prev && abs($rate - $prev) / $prev > 0.15) {
                $out[$cur] = ['rate' => $rate, 'accepted' => false, 'reason' => "₦$rate is more than 15% from yesterday's ₦$prev", 'sources' => array_keys($agree)];

                continue;
            }
            $out[$cur] = ['rate' => $rate, 'accepted' => true, 'reason' => count($agree).' sources agree', 'sources' => array_keys($agree)];
        }

        return $out;
    }

    /** Mask emails and phone numbers before any text goes to an AI provider (PRD §8 data rule). */
    public static function maskPii(string $text): string
    {
        $text = preg_replace('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', '[email]', $text);

        return preg_replace('/(?<!\d)(\+?\d[\d\s\-()]{7,}\d)(?!\d)/', '[phone]', $text);
    }
}
