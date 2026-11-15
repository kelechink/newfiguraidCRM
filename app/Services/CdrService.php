<?php

namespace App\Services;

use App\Domain\Telecom;
use App\Models\Carrier;
use App\Models\CdrImport;
use App\Models\Rate;
use App\Models\TrafficEntry;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Spatie\SimpleExcel\SimpleExcelReader;

/** CDR upload: rate each call against the customer's active sell deck (longest prefix, increments), aggregate per day/destination. */
class CdrService
{
    public function import(Carrier $customer, string $path, string $userId, ?string $fileId = null, string $routeType = 'cli'): CdrImport
    {
        $head = null;
        $c = [];
        $sell = Rate::where('carrier_id', $customer->id)->where('direction', 'sell')->where('route_type', $routeType)->whereNull('effective_to')->whereHas('deck', fn ($q) => $q->where('status', 'active'))->get();
        $agg = [];
        $calls = $unrated = 0;
        $errors = [];
        $line = 1;
        foreach (SimpleExcelReader::create($path)->noHeaderRow()->getRows() as $row) {
            $row = array_values(array_map(fn ($v) => $v instanceof \DateTimeInterface ? $v->format('Y-m-d H:i:s') : (string) $v, $row));
            if (! $head) {
                $head = array_map(fn ($h) => trim(preg_replace('/[^a-z0-9]+/', '_', strtolower($h)), '_'), $row);
                $find = fn (array $aliases) => collect($head)->search(fn ($h) => in_array($h, $aliases, true));
                $c = ['start' => $find(['start', 'start_time', 'starttime', 'call_start', 'date', 'datetime', 'connect_time', 'setup_time']), 'dialled' => $find(['b_number', 'bnumber', 'called', 'called_number', 'dialled', 'dialed', 'destination_number', 'cld', 'dst']), 'seconds' => $find(['duration', 'seconds', 'duration_seconds', 'billsec', 'bill_sec', 'duration_s'])];
                if (in_array(false, $c, true)) {
                    $errors[] = ['line' => 1, 'message' => 'Need start time, dialled number and duration columns'];
                    break;
                }

                continue;
            }
            $line++;
            $secs = (float) ($row[$c['seconds']] ?? -1);
            $num = preg_replace('/\D/', '', $row[$c['dialled']] ?? '');
            try {
                $date = CarbonImmutable::parse($row[$c['start']] ?? '')->toDateString();
            } catch (\Throwable) {
                $errors[] = ['line' => $line, 'message' => 'Bad start time'];

                continue;
            }
            if ($secs < 0 || $secs > 86400 || strlen($num) < 5) {
                $errors[] = ['line' => $line, 'message' => 'Bad duration or number'];

                continue;
            }
            $calls++;
            $rate = Telecom::matchPrefix($num, $sell);
            if (! $rate) {
                $unrated++;

                continue;
            }
            $k = "$date|$rate->prefix";
            $agg[$k] ??= ['date' => $date, 'rate' => $rate, 'billed' => 0.0, 'attempts' => 0, 'connected' => 0];
            $agg[$k]['attempts']++;
            if ($secs > 0) {
                $agg[$k]['connected']++;
                $agg[$k]['billed'] += Telecom::billSeconds($secs, $rate->increment_first, $rate->increment_next) / 60;
            }
        }

        return DB::transaction(function () use ($customer, $userId, $fileId, $agg, $calls, $unrated, $errors, $routeType) {
            $imp = CdrImport::create(['carrier_id' => $customer->id, 'file_id' => $fileId, 'calls' => $calls, 'unrated' => $unrated, 'errors' => array_slice($errors, 0, 100), 'uploaded_by_id' => $userId, 'billed_minutes' => round(array_sum(array_column($agg, 'billed')), 4)]);
            $buy = RateDeckService::bestBuy(array_unique(array_map(fn ($a) => $a['rate']->prefix, $agg)), $customer->currency, $routeType);
            foreach ($agg as $a) {
                $r = $a['rate'];
                $min = round($a['billed'], 4);
                TrafficEntry::create(['date' => $a['date'], 'customer_carrier_id' => $customer->id, 'destination' => $r->destination, 'prefix' => $r->prefix, 'minutes' => $min, 'attempts' => $a['attempts'], 'connected' => $a['connected'],
                    'sell_rate' => $r->rate, 'buy_rate' => $buy[$r->prefix] ?? null, 'currency' => $customer->currency, 'revenue' => round($min * $r->rate, 4), 'cost' => round($min * ($buy[$r->prefix] ?? 0), 4),
                    'source' => 'cdr', 'entered_by_id' => $userId, 'cdr_import_id' => $imp->id]);
            }

            return $imp;
        });
    }
}
