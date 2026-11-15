<?php

namespace App\Services;

use App\Domain\Money;
use App\Models\Invoice;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class InvoiceService
{
    /** FIG-WEB-2026-0001 / Q-… / CN-… numbering per unit and year, gap-free under a row lock. */
    public static function nextNumber(string $unitCode, string $kind = 'invoice'): string
    {
        $prefix = ['invoice' => 'FIG', 'quote' => 'Q', 'credit' => 'CN'][$kind].'-'.strtoupper(substr($unitCode, 0, 4)).'-'.now()->year.'-';

        return DB::transaction(function () use ($prefix) {
            $last = Invoice::withTrashed()->where('number', 'like', "$prefix%")->lockForUpdate()->orderByDesc('number')->value('number');
            $n = $last ? ((int) substr($last, -4)) + 1 : 1;

            return $prefix.str_pad((string) $n, 4, '0', STR_PAD_LEFT);
        });
    }

    public static function recalc(Invoice $inv, float $whtPct = 0): void
    {
        $lines = $inv->lines()->get();
        $t = Money::invoiceTotals($lines->map(fn ($l) => ['quantity' => (float) $l->quantity, 'unit_price' => (float) $l->unit_price, 'vatable' => (bool) $l->vatable])->all(), Money::VAT_PCT, $whtPct);
        foreach ($lines as $i => $l) {
            if ((float) $l->amount !== $t['lines'][$i]) {
                $l->forceFill(['amount' => $t['lines'][$i]])->save();
            }
        }
        if ($inv->currency !== 'NGN' && (float) $inv->fx_rate === 1.0) {
            $inv->fx_rate = FxService::rate($inv->currency, $inv->issue_date?->toDateString()) ?? 1;
        }
        $inv->forceFill(['subtotal' => $t['subtotal'], 'vat' => $t['vat'], 'wht' => $t['wht'], 'total' => $t['total']])->save();
    }

    public static function applyPayment(Invoice $inv, float $amount): void
    {
        $paid = Money::r2((float) $inv->amount_paid + $amount);
        $inv->forceFill(['amount_paid' => $paid, 'status' => Money::invoiceStatus((float) $inv->total, $paid, CarbonImmutable::parse($inv->due_date), CarbonImmutable::now(), $inv->status)])->save();
    }

    /** Quote accepted by e-signature → invoice. */
    public static function convertQuote(Invoice $quote): Invoice
    {
        return DB::transaction(function () use ($quote) {
            $inv = $quote->replicate(['number', 'public_token', 'signature_name', 'signed_at', 'signed_ip']);
            $inv->fill(['kind' => 'invoice', 'number' => self::nextNumber($quote->unit->code), 'status' => 'sent', 'issue_date' => today(), 'due_date' => today()->addDays(14), 'public_token' => Str::random(40)])->save();
            foreach ($quote->lines as $l) {
                $inv->lines()->create($l->only(['description', 'quantity', 'unit_price', 'cost_price', 'vatable', 'amount']));
            }
            $quote->forceFill(['status' => 'accepted'])->save();

            return $inv;
        });
    }
}
