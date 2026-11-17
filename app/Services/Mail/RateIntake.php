<?php

namespace App\Services\Mail;

use App\Authz\Access;
use App\Models\Activity;
use App\Models\AiAction;
use App\Models\BusinessUnit;
use App\Models\Carrier;
use App\Models\CarrierContact;
use App\Models\Company;
use App\Models\Contact;
use App\Models\RateDeck;
use App\Models\StoredFile;
use App\Models\User;
use App\Notifications\Alert;
use App\Services\RateDeckService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * rates@figuraid.com intake (plain code, no AI):
 *  1. Match the sender to a carrier (rate email, carrier contacts, or company domain).
 *  2. Unknown sender with a real rate sheet → new vendor lead: company, contact and carrier (testing, KYC pending).
 *  3. Each CSV/Excel attachment becomes a buy deck. Verified, active vendors go live at once; others wait for approval.
 *  4. Our sell decks are re-checked: anything now below cost or under the minimum margin is flagged to the team.
 *  5. The sender is kept up to date as a contact (rates contact on the carrier, activity on the timeline).
 */
class RateIntake
{
    public const SHEETS = ['csv', 'xlsx', 'txt'];

    public const FREE_MAIL = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'aol.com', 'proton.me', 'protonmail.com', 'yandex.com', 'mail.com'];

    public function handle(ParsedEmail $e): array
    {
        $carrier = $this->matchCarrier($e->fromEmail);
        $sheets = array_values(array_filter($e->attachments, fn ($a) => in_array(strtolower(pathinfo($a['name'], PATHINFO_EXTENSION)), self::SHEETS, true)));
        $legacy = array_values(array_filter($e->attachments, fn ($a) => strtolower(pathinfo($a['name'], PATHINFO_EXTENSION)) === 'xls'));
        $result = ['carrier' => $carrier?->name, 'decks' => [], 'new_vendor' => false, 'unread' => []];

        if (! $sheets) {
            $result['unread'] = array_map(fn ($a) => $a['name'], $legacy);

            return $result + ['note' => 'no spreadsheet'];
        }

        foreach ($sheets as $a) {
            $path = 'rate-sheets/'.now()->format('Y/m').'/'.Str::ulid().'-'.Str::slug(pathinfo($a['name'], PATHINFO_FILENAME)).'.'.strtolower(pathinfo($a['name'], PATHINFO_EXTENSION));
            Storage::disk('private')->put($path, $a['content']);
            $file = StoredFile::create(['disk' => 'private', 'path' => $path, 'original_name' => mb_substr($a['name'], 0, 190), 'mime' => $a['mime'], 'size' => strlen($a['content']), 'sha256' => hash('sha256', $a['content']), 'purpose' => 'rate_sheet']);
            $abs = Storage::disk('private')->path($path);
            $currency = $this->detectCurrency($e->subject.' '.$a['name'].' '.mb_substr($a['content'], 0, 600)) ?? $carrier?->currency ?? 'USD';
            $type = $this->detectRouteType($e->subject.' '.$a['name']);

            // Unknown sender: only create a vendor lead if the attachment really is a rate sheet (≥ 5 valid rows).
            if (! $carrier) {
                $probe = \App\Domain\Telecom::parseRateDeck(RateDeckService::readTable($abs));
                if (count($probe['rows']) < 5) {
                    $result['unread'][] = $a['name'];

                    continue;
                }
                $carrier = $this->newVendor($e, $currency);
                $result['new_vendor'] = true;
                $result['carrier'] = $carrier->name;
            }
            try {
                $deck = app(RateDeckService::class)->import($carrier, 'buy', $currency, today()->toDateString(), $abs, $file->id, mb_substr(($e->subject ?: $a['name']).' ('.today()->format('j M').')', 0, 180), $type);
            } catch (\Throwable $ex) {
                $result['unread'][] = $a['name'].': '.$ex->getMessage();

                continue;
            }
            $live = $carrier->kyc_status === 'verified' && $carrier->status === 'active';
            if ($live) {
                app(RateDeckService::class)->approve($deck, $this->systemApprover()?->id ?? '');
            }
            $cmp = $deck->fresh()->validation['compare'] ?? null;
            $result['decks'][] = ['id' => $deck->id, 'rates' => $deck->rates()->count(), 'type' => $type, 'currency' => $currency, 'live' => $live, 'compare' => $cmp];
        }

        $this->updateContacts($e, $carrier, $result);
        if (collect($result['decks'])->contains('live', true)) {
            $this->checkSellMargins($carrier, $result);
        }
        AiAction::forceCreate(['agent_key' => 'vendor', 'kind' => 'rate_parse', 'subject_type' => 'Carrier', 'subject_id' => $carrier?->id, 'input_summary' => mb_substr("Email from {$e->fromEmail}: {$e->subject}", 0, 500),
            'output' => json_encode($result), 'status' => 'done', 'provider' => 'code']);

        return $result;
    }

    public function matchCarrier(string $email): ?Carrier
    {
        $email = strtolower($email);
        $c = Carrier::whereRaw('lower(rate_email) = ?', [$email])->first()
            ?? Carrier::whereHas('contacts', fn ($q) => $q->whereRaw('lower(email) = ?', [$email]))->first();
        if ($c) {
            return $c;
        }
        $domain = substr(strrchr($email, '@') ?: '', 1);
        if (! $domain || in_array($domain, self::FREE_MAIL, true)) {
            return null;
        }

        return Carrier::where('rate_email', 'like', "%@$domain")->first()
            ?? Carrier::whereHas('contacts', fn ($q) => $q->where('email', 'like', "%@$domain"))->first();
    }

    private function newVendor(ParsedEmail $e, string $currency): Carrier
    {
        $unit = BusinessUnit::where('code', 'TELECOM')->first();
        $domain = substr(strrchr($e->fromEmail, '@') ?: '', 1);
        $companyName = $e->fromName && ! str_contains($e->fromName, '@') ? preg_replace('/\b(rates?|noc|team|desk|pricing)\b/i', '', $e->fromName) : null;
        $companyName = trim((string) $companyName) ?: Str::title(str_replace(['-', '_'], ' ', explode('.', $domain)[0] ?? 'Vendor'));
        $company = Company::firstOrCreate(['name' => $companyName], ['website' => $domain && ! in_array($domain, self::FREE_MAIL, true) ? "https://$domain" : null, 'industry' => 'Telecom carrier']);
        $contact = Contact::where('email_normalized', strtolower($e->fromEmail))->first() ?? Contact::create(['primary_unit_id' => $unit->id, 'company_id' => $company->id, 'display_name' => $e->fromName ?: $e->fromEmail, 'email' => $e->fromEmail,
            'lifecycle' => 'lead', 'source_channel' => 'email', 'source_detail' => 'rates@ mailbox', 'tags' => ['Rate sender', 'Vendor lead']]);
        $carrier = Carrier::forceCreate(['name' => $companyName, 'role' => 'vendor', 'currency' => $currency, 'status' => 'testing', 'kyc_status' => 'pending', 'rate_email' => strtolower($e->fromEmail), 'contact_id' => $contact->id, 'billing_mode' => 'prepaid', 'notes' => 'Created automatically from a rate sheet sent to rates@. Complete KYC before buying traffic.'])->refresh(); // load DB defaults (increments, cycle)
        $this->notify(['telecom_ops', 'admin'], 'New vendor sent rates', "{$companyName} ({$e->fromEmail}) sent a rate sheet. Their rates are saved as a draft; complete KYC and set them active to use them.", "/app/carriers/{$carrier->id}/edit");

        return $carrier;
    }

    private function updateContacts(ParsedEmail $e, ?Carrier $carrier, array $result): void
    {
        if (! $carrier) {
            return;
        }
        if (! $carrier->contacts()->whereRaw('lower(email) = ?', [strtolower($e->fromEmail)])->exists()) {
            CarrierContact::create(['carrier_id' => $carrier->id, 'name' => $e->fromName ?: $e->fromEmail, 'role' => 'rates', 'email' => strtolower($e->fromEmail)]);
        }
        if (! $carrier->rate_email) {
            $carrier->forceFill(['rate_email' => strtolower($e->fromEmail)])->save();
        }
        $contact = Contact::where('email_normalized', strtolower($e->fromEmail))->first() ?? ($carrier->contact_id ? Contact::find($carrier->contact_id) : null);
        if ($contact) {
            $contact->forceFill(['last_activity_at' => now(), 'tags' => array_values(array_unique(array_merge($contact->tags ?? [], ['Rate sender'])))])->saveQuietly();
            $summary = collect($result['decks'])->map(fn ($d) => $d['rates'].' '.strtoupper($d['type']).' rates'.($d['compare'] ? " ({$d['compare']['increase']} up, {$d['compare']['decrease']} down, {$d['compare']['new']} new)" : '').($d['live'] ? ' — live' : ' — awaiting approval'))->implode('; ');
            Activity::create(['contact_id' => $contact->id, 'type' => 'email', 'agent_key' => 'vendor', 'summary' => 'Rate sheet received by email: '.($summary ?: 'no readable sheet'), 'data' => ['subject' => $e->subject]]);
        }
    }

    /** After new buy rates go live, flag any active sell rate now below cost or under the minimum margin. */
    private function checkSellMargins(Carrier $vendor, array $result): void
    {
        $types = collect($result['decks'])->where('live', true)->pluck('type')->unique();
        $problems = [];
        foreach (RateDeck::where('direction', 'sell')->where('status', 'active')->whereIn('route_type', $types)->with('carrier')->get() as $deck) {
            $v = app(RateDeckService::class)->validate($deck);
            foreach ($v['blocking'] as $b) {
                $problems[] = "{$deck->carrier->name}: {$b['destination']} ({$b['prefix']}) ".($b['problem'] === 'below_cost' ? 'is now BELOW COST' : 'is under the '.$b['min_margin_pct'].'% minimum');
            }
        }
        if ($problems) {
            $this->notify(['finance', 'admin', 'super_admin'], 'Sell rates need repricing', count($problems).' sell rate(s) fell below cost or the minimum margin after '.$vendor->name."'s new rates:\n".implode("\n", array_slice($problems, 0, 15)), '/app/rate-decks', true);
            $this->notify(['telecom_ops'], 'Sell rates need repricing', count($problems).' sell rate(s) are now under the minimum margin. Open Rate decks and use "Build sell deck" to reprice.', '/app/rate-decks');
        }
    }

    public function detectCurrency(string $text): ?string
    {
        foreach (['EUR' => '/\bEUR\b|€/i', 'GBP' => '/\bGBP\b|£/i', 'USD' => '/\bUSD\b|US\$/i', 'NGN' => '/\bNGN\b|₦/i'] as $c => $re) {
            if (preg_match($re, $text)) {
                return $c;
            }
        }

        return null;
    }

    public function detectRouteType(string $text): string
    {
        return match (true) {
            (bool) preg_match('/\bsms\b|\ba2p\b/i', $text) => 'sms',
            (bool) preg_match('/\btdm\b/i', $text) => 'tdm',
            (bool) preg_match('/\bcc\b|call ?cent(er|re)/i', $text) => 'cc',
            default => 'cli',
        };
    }

    private function systemApprover(): ?User
    {
        return User::whereHas('role', fn ($q) => $q->where('key', 'super_admin'))->where('status', 'active')->first();
    }

    private function notify(array $roles, string $title, string $body, string $url, bool $email = false): void
    {
        User::where('status', 'active')->whereHas('role', fn ($q) => $q->whereIn('key', $roles))->get()
            ->filter(fn ($u) => Access::can($u, 'telecom.carriers'))
            ->each->notify(new Alert($title, $body, $url, $email));
    }
}
