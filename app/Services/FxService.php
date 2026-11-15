<?php

namespace App\Services;

use App\Domain\Money;
use App\Models\FxRate;
use App\Models\Setting;

/**
 * Daily naira rates. Basis "parallel" (default, per management): the AI searches Nigerian news/market pages
 * for today's parallel ("black market") rates; values are accepted only when two sources agree (Money::judgeRates).
 * Rejected values are stored as needs_review for Finance to confirm or override manually.
 */
class FxService
{
    public const CURRENCIES = ['USD', 'EUR', 'GBP'];

    public function __construct(private AiGateway $ai) {}

    public static function rate(string $currency, ?string $date = null): ?float
    {
        if ($currency === 'NGN') {
            return 1.0;
        }
        $basis = Setting::get('finance.fx_basis', 'parallel');
        $q = FxRate::query()->where('currency', $currency)->where('status', 'accepted')->where('date', '<=', $date ?? today()->toDateString());
        $r = (clone $q)->where('basis', $basis)->orderByDesc('date')->first() ?? $q->orderByDesc('date')->first();

        return $r ? (float) $r->ngn_per_unit : null;
    }

    /** Rate for a specific basis (parallel or official), or null when none is recorded. */
    public static function rateFor(string $currency, string $basis, ?string $date = null): ?float
    {
        if ($currency === 'NGN') {
            return 1.0;
        }
        $r = FxRate::where('currency', $currency)->where('basis', $basis)->where('status', 'accepted')->where('date', '<=', $date ?? today()->toDateString())->orderByDesc('date')->first();

        return $r ? (float) $r->ngn_per_unit : null;
    }

    public static function toNgn(float $amount, string $currency, ?string $date = null): ?float
    {
        $r = self::rate($currency, $date);

        return $r ? Money::r2($amount * $r) : null;
    }

    /**
     * Official (CBN / NFEM) rate, used for invoices' tax values and statutory reports. Same two-source rule.
     */
    public function researchOfficial(): array
    {
        $today = today()->toDateString();
        $system = 'You research the OFFICIAL Nigerian foreign-exchange rate (CBN / NFEM closing rate) for USD, EUR and GBP. Use web search; report only official-market figures published today or yesterday by distinct sources (cbn.gov.ng, FMDQ, Nairametrics, BusinessDay…). Reply ONLY with JSON: {"rates":[{"currency":"USD","buy":0,"sell":0,"source":"Outlet","url":"https://...","published_on":"YYYY-MM-DD"}]}';
        $res = $this->ai->complete($system, "Today is $today. Find today's official naira rates.", 'heavy', search: true, mask: false);
        $found = Money::extractJson($res['text'])['rates'] ?? [];
        $prev = [];
        foreach (self::CURRENCIES as $c) {
            $prev[$c] = self::rateFor($c, 'official', now()->subDay()->toDateString());
        }
        $verdicts = Money::judgeRates($found, array_filter($prev), $today, self::CURRENCIES);
        foreach ($verdicts as $cur => $v) {
            if ($v['rate'] !== null) {
                FxRate::updateOrCreate(['currency' => $cur, 'date' => $today, 'basis' => 'official'], ['ngn_per_unit' => $v['rate'], 'sources' => $v['sources'], 'status' => $v['accepted'] ? 'accepted' : 'needs_review']);
            }
        }

        return $verdicts;
    }

    public function research(): array
    {
        $today = today()->toDateString();
        $system = 'You research public foreign-exchange market rates in Nigeria. Use web search. Report parallel-market (black market / BDC) naira rates for USD, EUR and GBP published today or yesterday by distinct outlets (e.g. Nairametrics, BusinessDay, Punch, Vanguard, abokiFX, Daily Trust). Reply ONLY with JSON: {"rates":[{"currency":"USD","buy":0,"sell":0,"source":"Outlet","url":"https://...","published_on":"YYYY-MM-DD"}]}';
        $res = $this->ai->complete($system, "Today is $today. Find today's Lagos/Abuja parallel market rates.", 'heavy', search: true, mask: false);
        $found = Money::extractJson($res['text'])['rates'] ?? [];
        $prev = [];
        foreach (self::CURRENCIES as $c) {
            $prev[$c] = self::rate($c, now()->subDay()->toDateString());
        }
        $verdicts = Money::judgeRates($found, array_filter($prev), $today, self::CURRENCIES);
        foreach ($verdicts as $cur => $v) {
            if ($v['rate'] === null) {
                continue;
            }
            FxRate::updateOrCreate(['currency' => $cur, 'date' => $today, 'basis' => 'parallel'], [
                'ngn_per_unit' => $v['rate'], 'sources' => $v['sources'], 'status' => $v['accepted'] ? 'accepted' : 'needs_review',
            ]);
        }

        return $verdicts;
    }
}
