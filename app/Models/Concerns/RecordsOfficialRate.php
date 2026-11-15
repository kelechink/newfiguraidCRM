<?php

namespace App\Models\Concerns;

use App\Services\FxService;

/** Keep the official (CBN) rate alongside the parallel rate on money records, for tax and statutory reporting. */
trait RecordsOfficialRate
{
    public static function bootRecordsOfficialRate(): void
    {
        static::saving(function ($m) {
            if ($m->currency && $m->currency !== 'NGN' && $m->fx_rate_official === null) {
                $date = $m->issue_date ?? $m->date ?? $m->paid_at ?? now();
                $m->fx_rate_official = FxService::rateFor($m->currency, 'official', $date instanceof \DateTimeInterface ? $date->format('Y-m-d') : (string) $date);
            }
        });
    }
}
