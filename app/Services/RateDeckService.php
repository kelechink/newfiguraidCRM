<?php

namespace App\Services;

use App\Domain\Telecom;
use App\Models\Carrier;
use App\Models\MarginRule;
use App\Models\Rate;
use App\Models\RateDeck;
use App\Models\Setting;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Spatie\SimpleExcel\SimpleExcelReader;

/**
 * Vendor rate-sheet intake and sell-deck checks — plain code, never AI (PRD v3 §8).
 * Sell decks are hard-blocked below cost or below the minimum margin for the route.
 */
class RateDeckService
{
    public static function readTable(string $path): array
    {
        $rows = SimpleExcelReader::create($path)->noHeaderRow()->getRows()->map(fn ($r) => array_map(fn ($v) => $v instanceof \DateTimeInterface ? $v->format('Y-m-d') : (string) $v, array_values($r)))->all();
        // skip banner rows above the real header (vendors often add a title block)
        foreach ($rows as $i => $r) {
            $h = strtolower(implode(' ', $r));
            if (preg_match('/prefix|code/', $h) && preg_match('/rate|price|cost/', $h)) {
                return array_slice($rows, $i);
            }
        }

        return $rows;
    }

    public const ROUTE_TYPES = ['cli' => 'CLI voice', 'cc' => 'CC voice', 'tdm' => 'TDM voice', 'sms' => 'SMS'];

    public function import(Carrier $carrier, string $direction, string $currency, string $effective, string $path, ?string $fileId = null, ?string $name = null, string $routeType = 'cli'): RateDeck
    {
        $parsed = Telecom::parseRateDeck(self::readTable($path));
        if (! $parsed['rows']) {
            throw new RuntimeException('No rates found: '.collect($parsed['errors'])->take(3)->map(fn ($e) => "line {$e['line']}: {$e['message']}")->implode('; '));
        }

        return DB::transaction(function () use ($carrier, $direction, $currency, $effective, $parsed, $fileId, $name, $routeType) {
            $deck = RateDeck::forceCreate(['carrier_id' => $carrier->id, 'direction' => $direction, 'route_type' => $routeType, 'name' => $name ?: strtoupper($routeType).' '.$direction.' deck '.$carrier->name.' '.$effective, 'currency' => $currency, 'effective_from' => $effective, 'source' => 'upload', 'file_id' => $fileId, 'status' => 'draft']);
            foreach (array_chunk($parsed['rows'], 500) as $chunk) {
                Rate::insert(array_map(fn ($r) => ['rate_deck_id' => $deck->id, 'carrier_id' => $carrier->id, 'direction' => $direction, 'route_type' => $routeType, 'destination' => mb_substr($r['destination'] ?: $r['prefix'], 0, 120), 'prefix' => $r['prefix'], 'rate' => $r['rate'], 'currency' => $currency, 'effective_from' => $r['effective_from'] ?? $effective, 'increment_first' => $carrier->increment_first, 'increment_next' => $carrier->increment_next], $chunk));
            }
            $deck->forceFill(['validation' => $this->validate($deck) + ['parse_errors' => array_slice($parsed['errors'], 0, 50)]])->save();

            return $deck;
        });
    }

    /** Current lowest buy rate per prefix, converted into $currency. */
    public static function bestBuy(array $prefixes, string $currency, string $routeType = 'cli'): array
    {
        $toNgn = fn ($cur) => FxService::rate($cur) ?? 0;
        $target = $toNgn($currency) ?: 1;
        $rows = Rate::query()->join('rate_decks', 'rate_decks.id', '=', 'rates.rate_deck_id')->where('rate_decks.status', 'active')->where('rates.direction', 'buy')->where('rates.route_type', $routeType)->whereIn('rates.prefix', $prefixes)
            ->whereNull('rates.effective_to')->get(['rates.prefix', 'rates.rate', 'rates.currency']);
        $best = [];
        foreach ($rows as $r) {
            $v = $r->rate * $toNgn($r->currency) / $target;
            if (! isset($best[$r->prefix]) || $v < $best[$r->prefix]) {
                $best[$r->prefix] = $v;
            }
        }

        return $best;
    }

    public function validate(RateDeck $deck): array
    {
        $rates = $deck->rates()->get(['prefix', 'rate', 'destination']);
        if ($deck->direction === 'buy') {
            $prev = RateDeck::where('carrier_id', $deck->carrier_id)->where('direction', 'buy')->where('route_type', $deck->route_type)->where('status', 'active')->where('id', '!=', $deck->id)->latest('effective_from')->first();
            $cmp = $prev ? Telecom::compareDecks($prev->rates()->get(['prefix', 'rate'])->toArray(), $rates->toArray()) : null;

            return ['rows' => $rates->count(), 'compare' => $cmp ? array_map('count', $cmp) + ['increase_prefixes' => array_slice($cmp['increase'], 0, 30)] : null, 'blocking' => []];
        }
        [$minDefault, $rules] = self::marginRules($deck->route_type);
        $best = self::bestBuy($rates->pluck('prefix')->all(), $deck->currency, $deck->route_type);
        $blocking = [];
        foreach ($rates as $r) {
            $min = (float) ($rules[$r->prefix] ?? $minDefault ?? 0); // SMS: no fixed minimum, but never below cost
            $problem = Telecom::checkSellRate((float) $r->rate, $best[$r->prefix] ?? null, $min);
            if ($problem) {
                $blocking[] = ['prefix' => $r->prefix, 'destination' => $r->destination, 'problem' => $problem, 'min_margin_pct' => $min];
            }
        }

        return ['rows' => $rates->count(), 'no_buy_rate' => count(array_diff($rates->pluck('prefix')->all(), array_keys($best))), 'blocking' => $blocking, 'margin_alert_pct' => (float) Setting::get('telecom.margin_alert_pct', 2)];
    }

    /** [default min %, per-prefix min %] for a route type. Null default = no fixed minimum (SMS). */
    public static function marginRules(string $routeType): array
    {
        $default = MarginRule::whereNull('prefix')->where('service', $routeType)->value('min_margin_pct');

        return [$default === null ? null : (float) $default, MarginRule::whereNotNull('prefix')->where('service', $routeType)->pluck('min_margin_pct', 'prefix')->map(fn ($v) => $v === null ? null : (float) $v)->all()];
    }

    public static function targetMargin(string $routeType, ?string $prefix = null): ?float
    {
        $v = ($prefix ? MarginRule::where('service', $routeType)->where('prefix', $prefix)->value('target_margin_pct') : null)
            ?? MarginRule::where('service', $routeType)->whereNull('prefix')->value('target_margin_pct');

        return $v === null ? null : (float) $v;
    }

    /**
     * Sell-deck builder: for each destination with an active buy rate of this route type, price at the target
     * margin (8% for voice) — or a margin the user enters (needed for SMS, which has no default). Draft only.
     */
    public function buildSellDeck(Carrier $customer, string $routeType, string $currency, string $effective, ?float $marginPct = null, ?array $prefixes = null): RateDeck
    {
        $buys = Rate::query()->join('rate_decks', 'rate_decks.id', '=', 'rates.rate_deck_id')->where('rate_decks.status', 'active')
            ->where('rates.direction', 'buy')->where('rates.route_type', $routeType)->whereNull('rates.effective_to')
            ->when($prefixes, fn ($q) => $q->whereIn('rates.prefix', $prefixes))->get(['rates.prefix', 'rates.destination']);
        if ($buys->isEmpty()) {
            throw new RuntimeException('No active '.strtoupper($routeType).' buy rates to price from.');
        }
        $best = self::bestBuy($buys->pluck('prefix')->unique()->all(), $currency, $routeType);
        $names = $buys->pluck('destination', 'prefix');

        return DB::transaction(function () use ($customer, $routeType, $currency, $effective, $marginPct, $best, $names) {
            $deck = RateDeck::forceCreate(['carrier_id' => $customer->id, 'direction' => 'sell', 'route_type' => $routeType, 'currency' => $currency, 'effective_from' => $effective, 'source' => 'builder', 'status' => 'draft',
                'name' => strtoupper($routeType).' sell deck '.$customer->name.' '.$effective]);
            foreach ($best as $prefix => $cost) {
                $pct = $marginPct ?? self::targetMargin($routeType, (string) $prefix);
                if ($pct === null) {
                    throw new RuntimeException('SMS has no default margin — enter the margin to use.');
                }
                $deck->rates()->create(['carrier_id' => $customer->id, 'direction' => 'sell', 'route_type' => $routeType, 'destination' => $names[$prefix] ?? (string) $prefix, 'prefix' => (string) $prefix,
                    'rate' => Telecom::priceFor($cost, $pct), 'currency' => $currency, 'effective_from' => $effective, 'increment_first' => $customer->increment_first, 'increment_next' => $customer->increment_next]);
            }
            $deck->forceFill(['validation' => $this->validate($deck)])->save();

            return $deck;
        });
    }

    /** Activate a deck. Sell decks with blocking problems cannot be approved by anyone. */
    public function approve(RateDeck $deck, string $userId): void
    {
        $v = $this->validate($deck);
        if (! empty($v['blocking'])) {
            $deck->forceFill(['status' => 'blocked', 'validation' => $v])->save();
            throw new RuntimeException(count($v['blocking']).' route(s) are below cost or under the minimum margin. Fix the prices and upload again.');
        }
        DB::transaction(function () use ($deck, $userId, $v) {
            $older = RateDeck::where('carrier_id', $deck->carrier_id)->where('direction', $deck->direction)->where('route_type', $deck->route_type)->where('status', 'active')->where('id', '!=', $deck->id)->pluck('id');
            Rate::whereIn('rate_deck_id', $older)->whereNull('effective_to')->update(['effective_to' => $deck->effective_from]);
            RateDeck::whereIn('id', $older)->update(['status' => 'superseded']);
            $deck->forceFill(['status' => 'active', 'approved_by_id' => $userId, 'approved_at' => now(), 'validation' => $v])->save();
        });
    }
}
