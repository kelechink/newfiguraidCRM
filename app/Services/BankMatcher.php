<?php

namespace App\Services;

use App\Domain\Money;
use App\Models\BankAccount;
use App\Models\BankTransaction;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Support\Facades\DB;
use Spatie\SimpleExcel\SimpleExcelReader;

/** Bank statement upload (CSV/Excel) → auto-match credits to open invoices; uncertain ones go to the review queue. */
class BankMatcher
{
    public const AUTO = 90;

    public const SUGGEST = 60;

    public function import(BankAccount $acct, string $path): array
    {
        $rows = SimpleExcelReader::create($path)->getRows();
        $added = $dupes = 0;
        foreach ($rows as $r) {
            $r = array_change_key_case($r);
            $date = $r['date'] ?? $r['transaction date'] ?? $r['value date'] ?? $r['trans date'] ?? null;
            $desc = (string) ($r['description'] ?? $r['narration'] ?? $r['details'] ?? $r['remarks'] ?? '');
            $credit = (float) str_replace(',', '', (string) ($r['credit'] ?? $r['deposit'] ?? $r['money in'] ?? 0));
            $debit = (float) str_replace(',', '', (string) ($r['debit'] ?? $r['withdrawal'] ?? $r['money out'] ?? 0));
            $amount = isset($r['amount']) ? (float) str_replace(',', '', (string) $r['amount']) : $credit - $debit;
            if (! $date || $amount == 0) {
                continue;
            }
            $d = $date instanceof \DateTimeInterface ? $date->format('Y-m-d') : date('Y-m-d', strtotime(str_replace('/', '-', (string) $date)));
            $hash = hash('sha256', "$acct->id|$d|$desc|$amount|".($r['reference'] ?? ''));
            $tx = BankTransaction::firstOrCreate(['hash' => $hash], ['bank_account_id' => $acct->id, 'date' => $d, 'description' => mb_substr($desc, 0, 500), 'amount' => $amount, 'reference' => $r['reference'] ?? null]);
            $tx->wasRecentlyCreated ? $added++ : $dupes++;
        }
        $matched = $this->matchAll();

        return compact('added', 'dupes') + $matched;
    }

    public function matchAll(): array
    {
        $auto = $suggested = 0;
        $open = Invoice::whereIn('status', ['sent', 'part_paid', 'overdue'])->where('kind', 'invoice')->with(['contact', 'carrier'])->get();
        BankTransaction::where('match_status', 'unmatched')->where('amount', '>', 0)->each(function (BankTransaction $tx) use ($open, &$auto, &$suggested) {
            $best = null;
            $score = 0;
            foreach ($open as $inv) {
                $ngnOutstanding = $inv->outstanding() * ($inv->currency === 'NGN' ? 1 : (float) $inv->fx_rate);
                $s = Money::matchScore((float) $tx->amount, $tx->description.' '.$tx->reference, $tx->date->toDateString(), [
                    'outstanding' => $inv->currency === 'NGN' ? $inv->outstanding() : $ngnOutstanding, 'subtotal' => (float) $inv->subtotal, 'number' => $inv->number,
                    'customer' => $inv->carrier?->name ?? $inv->contact?->display_name, 'issue_date' => $inv->issue_date->toDateString(),
                ]);
                if ($s > $score) {
                    [$best, $score] = [$inv, $s];
                }
            }
            if ($best && $score >= self::AUTO) {
                $this->confirm($tx, $best);
                $auto++;
            } elseif ($best && $score >= self::SUGGEST) {
                $tx->forceFill(['match_status' => 'suggested', 'suggested_invoice_id' => $best->id, 'match_confidence' => $score])->save();
                $suggested++;
            }
        });

        return compact('auto', 'suggested');
    }

    public function confirm(BankTransaction $tx, Invoice $inv): Payment
    {
        return DB::transaction(function () use ($tx, $inv) {
            $amountInvoiceCcy = $inv->currency === 'NGN' ? (float) $tx->amount : Money::r2($tx->amount / max(0.0001, (float) $inv->fx_rate));
            $p = Payment::create([
                'unit_id' => $inv->unit_id, 'invoice_id' => $inv->id, 'contact_id' => $inv->contact_id, 'gateway' => 'bank', 'reference' => 'BANK-'.substr($tx->hash, 0, 16),
                'amount' => $amountInvoiceCcy, 'currency' => $inv->currency, 'amount_ngn' => $tx->amount, 'paid_at' => $tx->date, 'status' => 'confirmed', 'verified_with_gateway' => true,
                'meta' => ['bank_transaction_id' => $tx->id],
            ]);
            InvoiceService::applyPayment($inv, $amountInvoiceCcy);
            $tx->forceFill(['match_status' => 'matched', 'payment_id' => $p->id, 'suggested_invoice_id' => $inv->id])->save();

            return $p;
        });
    }
}
