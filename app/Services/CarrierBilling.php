<?php

namespace App\Services;

use App\Domain\Telecom;
use App\Models\BillingCycle;
use App\Models\BusinessUnit;
use App\Models\Carrier;
use App\Models\Dispute;
use App\Models\Invoice;
use App\Models\Setting;
use App\Models\TrafficEntry;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Wholesale billing (plain code):
 *  - Customer cycles (7/3, 7/4, 30/15…): at the end of each cycle, invoice the carrier for its rated traffic.
 *    Prepaid carriers get a statement marked paid (usage is taken from their balance daily).
 *  - Vendor cycles: our own cost per cycle; Finance enters the vendor's statement and any difference above the
 *    tolerance opens a dispute automatically.
 *  - Prepaid: daily usage is deducted from the balance; low balance warns, zero balance flags suspension.
 */
class CarrierBilling
{
    public function closeCycles(?CarbonImmutable $now = null): array
    {
        $now ??= CarbonImmutable::now();
        $out = ['invoices' => 0, 'vendor_cycles' => 0];
        foreach (Carrier::whereIn('status', ['active', 'testing'])->get() as $c) {
            [$days, $terms] = Telecom::terms($c->billing_cycle);
            $anchor = CarbonImmutable::parse($c->cycle_anchor ?? $c->created_at)->startOfDay();
            [$start, $end] = Telecom::lastClosedCycle($anchor, $days, $now);
            if ($end->gt($now) || $start->lt($anchor)) {
                continue;
            }
            if (in_array($c->role, ['customer', 'both'], true)) {
                $out['invoices'] += (int) (bool) $this->customerCycle($c, $start, $end, $terms);
            }
            if (in_array($c->role, ['vendor', 'both'], true)) {
                $out['vendor_cycles'] += (int) (bool) $this->vendorCycle($c, $start, $end, $terms);
            }
        }

        return $out;
    }

    public function customerCycle(Carrier $c, CarbonImmutable $start, CarbonImmutable $end, int $terms): ?BillingCycle
    {
        if (BillingCycle::where('carrier_id', $c->id)->where('side', 'customer')->whereDate('period_start', $start)->exists()) {
            return null;
        }
        $rows = TrafficEntry::where('customer_carrier_id', $c->id)->where('date', '>=', $start->toDateString())->where('date', '<', $end->toDateString())
            ->selectRaw('destination, sell_rate, sum(minutes) minutes, sum(revenue) revenue')->groupBy('destination', 'sell_rate')->get();
        $minutes = (float) $rows->sum('minutes');
        $amount = round((float) $rows->sum('revenue'), 4);

        return DB::transaction(function () use ($c, $start, $end, $terms, $rows, $minutes, $amount) {
            $cycle = BillingCycle::create(['carrier_id' => $c->id, 'side' => 'customer', 'period_start' => $start, 'period_end' => $end, 'due_date' => $end->addDays($terms), 'minutes' => $minutes, 'amount' => $amount, 'currency' => $c->currency]);
            if ($amount <= 0) {
                $cycle->forceFill(['status' => 'settled'])->save();

                return $cycle;
            }
            $unit = BusinessUnit::where('code', 'TELECOM')->first();
            $inv = Invoice::forceCreate(['unit_id' => $unit->id, 'carrier_id' => $c->id, 'contact_id' => $c->contact_id, 'currency' => $c->currency, 'fx_rate' => FxService::rate($c->currency, $end->toDateString()) ?? 1,
                'fx_rate_official' => FxService::rateFor($c->currency, 'official', $end->toDateString()), 'issue_date' => $end, 'due_date' => $end->addDays($terms), 'status' => 'sent', 'kind' => 'invoice',
                'notes' => 'Traffic '.$start->format('j M').' – '.$end->subDay()->format('j M Y').' · '.number_format($minutes, 2).' billed minutes · '.$c->billing_cycle.' terms'.($c->billing_mode === 'prepaid' ? ' · settled from prepaid balance' : '')]);
            foreach ($rows as $r) {
                // Wholesale international voice is treated as an export of services (no VAT) unless billed in naira — confirm with your tax adviser.
                $inv->lines()->create(['description' => $r->destination.' — '.number_format((float) $r->minutes, 2).' min', 'quantity' => round((float) $r->minutes, 2), 'unit_price' => (float) $r->sell_rate, 'vatable' => $c->currency === 'NGN', 'amount' => round((float) $r->revenue, 2)]);
            }
            InvoiceService::recalc($inv);
            if ($c->billing_mode === 'prepaid') {
                $inv->forceFill(['amount_paid' => $inv->total, 'status' => 'paid'])->save();
            }
            $cycle->forceFill(['invoice_id' => $inv->id, 'status' => $c->billing_mode === 'prepaid' ? 'settled' : 'invoiced'])->save();
            Ops::notifyRoles(['finance', 'telecom_ops'], 'Carrier invoice raised', "$inv->number for {$c->name}: {$c->currency} ".number_format((float) $inv->total, 2), "/app/invoices/$inv->id/edit");

            return $cycle;
        });
    }

    public function vendorCycle(Carrier $c, CarbonImmutable $start, CarbonImmutable $end, int $terms): ?BillingCycle
    {
        if (BillingCycle::where('carrier_id', $c->id)->where('side', 'vendor')->whereDate('period_start', $start)->exists()) {
            return null;
        }
        $q = TrafficEntry::where('vendor_carrier_id', $c->id)->where('date', '>=', $start->toDateString())->where('date', '<', $end->toDateString());
        $toVendorCcy = fn ($row) => $row->currency === $c->currency ? (float) $row->cost : (float) $row->cost * (FxService::rate($row->currency) ?? 0) / max(0.0001, FxService::rate($c->currency) ?? 1);

        return BillingCycle::create(['carrier_id' => $c->id, 'side' => 'vendor', 'period_start' => $start, 'period_end' => $end, 'due_date' => $end->addDays($terms),
            'minutes' => (float) (clone $q)->sum('minutes'), 'amount' => round((clone $q)->get()->sum($toVendorCcy), 4), 'currency' => $c->currency]);
    }

    /** Finance enters the vendor's invoice/statement; mismatches above tolerance open a dispute. */
    public function recordStatement(BillingCycle $cycle, float $minutes, float $amount, ?string $fileId = null): string
    {
        $tol = (float) Setting::get('telecom.statement_tolerance_pct', 1);
        $diff = $cycle->amount > 0 ? abs($amount - (float) $cycle->amount) / (float) $cycle->amount * 100 : ($amount > 0 ? 100 : 0);
        $status = $diff <= $tol ? 'matched' : 'mismatch';
        $cycle->forceFill(['statement_minutes' => $minutes, 'statement_amount' => $amount, 'statement_file_id' => $fileId, 'status' => $status])->save();
        if ($status === 'mismatch') {
            Dispute::create(['carrier_id' => $cycle->carrier_id, 'period' => $cycle->period_start->format('j M').' – '.$cycle->period_end->subDay()->format('j M Y'), 'our_amount' => $cycle->amount, 'their_amount' => $amount, 'currency' => $cycle->currency,
                'notes' => 'Vendor statement differs by '.round($diff, 2).'% (our minutes '.number_format((float) $cycle->minutes, 2).', theirs '.number_format($minutes, 2).'). Opened automatically.']);
            Ops::notifyRoles(['finance', 'telecom_ops'], 'Vendor statement mismatch', $cycle->carrier->name.': '.round($diff, 2).'% difference — dispute opened.', '/app/disputes', true);
        }

        return $status;
    }

    public function topUp(Carrier $c, float $amount, string $reference, ?User $by): void
    {
        DB::transaction(function () use ($c, $amount, $reference, $by) {
            $c = Carrier::lockForUpdate()->find($c->id);
            $bal = round((float) $c->prepaid_balance + $amount, 4);
            DB::table('prepaid_ledger')->insert(['carrier_id' => $c->id, 'date' => today()->toDateString(), 'kind' => 'topup', 'amount' => $amount, 'balance_after' => $bal, 'reference' => mb_substr($reference, 0, 190), 'created_by_id' => $by?->id, 'created_at' => now(), 'updated_at' => now()]);
            $c->forceFill(['prepaid_balance' => $bal, 'suspended_at' => $bal > 0 ? null : $c->suspended_at, 'suspend_reason' => $bal > 0 ? null : $c->suspend_reason])->save();
        });
    }

    /** Deduct each day's rated usage from prepaid balances once; warn when low, flag suspension at zero. */
    public function burnPrepaid(?string $date = null): int
    {
        $date ??= today()->subDay()->toDateString();
        $n = 0;
        foreach (Carrier::where('billing_mode', 'prepaid')->whereIn('role', ['customer', 'both'])->get() as $c) {
            $usage = round((float) TrafficEntry::where('customer_carrier_id', $c->id)->whereDate('date', $date)->sum('revenue'), 4);
            if ($usage <= 0 || DB::table('prepaid_ledger')->where(['carrier_id' => $c->id, 'kind' => 'usage', 'date' => $date])->exists()) {
                continue;
            }
            DB::transaction(function () use ($c, $usage, $date) {
                $c = Carrier::lockForUpdate()->find($c->id);
                $bal = round((float) $c->prepaid_balance - $usage, 4);
                DB::table('prepaid_ledger')->insert(['carrier_id' => $c->id, 'date' => $date, 'kind' => 'usage', 'amount' => -$usage, 'balance_after' => $bal, 'reference' => "usage $date", 'created_at' => now(), 'updated_at' => now()]);
                $c->forceFill(['prepaid_balance' => $bal])->save();
                if ($bal <= 0 && ! $c->suspended_at) {
                    $c->forceFill(['suspended_at' => now(), 'suspend_reason' => 'Prepaid balance exhausted'])->save();
                    Ops::notifyRoles(['telecom_ops', 'finance', 'admin'], "Suspend {$c->name} on the switch", "Prepaid balance is {$c->currency} ".number_format($bal, 2).'. Block their traffic until they top up.', "/app/carriers/$c->id/edit", true);
                } elseif ($c->low_balance_threshold > 0 && $bal < (float) $c->low_balance_threshold) {
                    Ops::notifyRoles(['telecom_ops', 'finance'], "Low prepaid balance: {$c->name}", "{$c->currency} ".number_format($bal, 2).' left. Ask them to top up.', "/app/carriers/$c->id/edit");
                }
            });
            $n++;
        }

        return $n;
    }
}
