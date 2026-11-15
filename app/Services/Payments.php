<?php

namespace App\Services;

use App\Models\BusinessUnit;
use App\Models\Contact;
use App\Models\Enrolment;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

/**
 * Income from gateways. Academy → Paystack (matched by reference / metadata). FigureWeb WHMCS → Flutterwave.
 * Telecom → bank transfer (see BankMatcher). A webhook is never trusted on its own: every payment is re-verified
 * with the gateway API using the secret key before it is recorded (PRD §11).
 */
class Payments
{
    public static function verifyPaystackSignature(string $raw, ?string $sig): bool
    {
        $key = config('services.paystack.secret');

        return $key && $sig && hash_equals(hash_hmac('sha512', $raw, $key), $sig);
    }

    public static function verifyFlutterwaveSignature(?string $hash): bool
    {
        $secret = config('services.flutterwave.webhook_hash');

        return $secret && $hash && hash_equals($secret, $hash);
    }

    /** Insert-once guard against webhook replays. */
    public static function firstDelivery(string $provider, string $eventId): bool
    {
        return DB::table('webhook_events')->insertOrIgnore(['provider' => $provider, 'event_id' => substr($eventId, 0, 120), 'received_at' => now()]) === 1;
    }

    public function confirmPaystack(string $reference): ?Payment
    {
        $r = Http::withToken(config('services.paystack.secret'))->timeout(30)->get('https://api.paystack.co/transaction/verify/'.rawurlencode($reference));
        if (! $r->successful() || $r->json('data.status') !== 'success') {
            return null;
        }
        $d = $r->json('data');
        $unit = BusinessUnit::where('code', 'ACADEMY')->first();
        $email = strtolower($d['customer']['email'] ?? '');
        $contact = $email ? Contact::where('email_normalized', $email)->first() : null;

        return DB::transaction(function () use ($d, $unit, $contact, $reference) {
            $p = Payment::firstOrCreate(['gateway' => 'paystack', 'reference' => $reference], [
                'unit_id' => $unit->id, 'contact_id' => $contact?->id, 'amount' => $d['amount'] / 100, 'currency' => $d['currency'] ?? 'NGN',
                'amount_ngn' => FxService::toNgn($d['amount'] / 100, $d['currency'] ?? 'NGN') ?? $d['amount'] / 100,
                'paid_at' => $d['paid_at'] ?? now(), 'status' => 'confirmed', 'verified_with_gateway' => true,
                'meta' => ['channel' => $d['channel'] ?? null, 'metadata' => $d['metadata'] ?? null],
            ]);
            if ($p->wasRecentlyCreated) {
                $enrolId = $d['metadata']['enrolment_id'] ?? null;
                $en = $enrolId ? Enrolment::find($enrolId) : Enrolment::where('paystack_reference', $reference)->first();
                if (! $en && $contact) {
                    $en = Enrolment::where('contact_id', $contact->id)->whereColumn('amount_paid', '<', 'fee')->latest()->first();
                }
                $en?->forceFill(['amount_paid' => $en->amount_paid + $p->amount, 'paystack_reference' => $en->paystack_reference ?? $reference])->save();
            }

            return $p;
        });
    }

    public function confirmFlutterwave(string $transactionId): ?Payment
    {
        $r = Http::withToken(config('services.flutterwave.secret'))->timeout(30)->get("https://api.flutterwave.com/v3/transactions/$transactionId/verify");
        if (! $r->successful() || $r->json('data.status') !== 'successful') {
            return null;
        }
        $d = $r->json('data');
        $unit = BusinessUnit::where('code', 'FIGUREWEB')->first();
        $invoice = Invoice::where('external_ref', (string) ($d['meta']['invoiceid'] ?? $d['tx_ref'] ?? ''))->orWhere('number', $d['tx_ref'] ?? '')->first();

        return DB::transaction(function () use ($d, $unit, $invoice) {
            $p = Payment::firstOrCreate(['gateway' => 'flutterwave', 'reference' => (string) $d['id']], [
                'unit_id' => $unit->id, 'invoice_id' => $invoice?->id, 'contact_id' => $invoice?->contact_id, 'amount' => $d['amount'], 'currency' => $d['currency'],
                'amount_ngn' => FxService::toNgn((float) $d['amount'], $d['currency']) ?? $d['amount'], 'paid_at' => $d['created_at'] ?? now(),
                'status' => 'confirmed', 'verified_with_gateway' => true, 'meta' => ['tx_ref' => $d['tx_ref'] ?? null],
            ]);
            if ($p->wasRecentlyCreated && $invoice) {
                InvoiceService::applyPayment($invoice, (float) $p->amount);
            }

            return $p;
        });
    }

    /** Pull the last N days of Paystack transactions (CRM reads with the secret key). */
    public function syncPaystack(int $days = 3): int
    {
        if (! config('services.paystack.secret')) {
            return 0;
        }
        $r = Http::withToken(config('services.paystack.secret'))->get('https://api.paystack.co/transaction', ['status' => 'success', 'from' => now()->subDays($days)->toIso8601String(), 'perPage' => 100]);
        $n = 0;
        foreach ($r->json('data', []) as $t) {
            if (! Payment::where('gateway', 'paystack')->where('reference', $t['reference'])->exists() && $this->confirmPaystack($t['reference'])) {
                $n++;
            }
        }

        return $n;
    }

    public function syncFlutterwave(int $days = 3): int
    {
        if (! config('services.flutterwave.secret')) {
            return 0;
        }
        $r = Http::withToken(config('services.flutterwave.secret'))->get('https://api.flutterwave.com/v3/transactions', ['from' => now()->subDays($days)->toDateString(), 'to' => now()->toDateString(), 'status' => 'successful']);
        $n = 0;
        foreach ($r->json('data', []) as $t) {
            if (! Payment::where('gateway', 'flutterwave')->where('reference', (string) $t['id'])->exists() && $this->confirmFlutterwave((string) $t['id'])) {
                $n++;
            }
        }

        return $n;
    }
}
