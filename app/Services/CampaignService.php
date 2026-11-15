<?php

namespace App\Services;

use App\Domain\Money;
use App\Models\Campaign;
use App\Models\CampaignRecipient;
use App\Models\Contact;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use RuntimeException;

/**
 * Email campaigns (Seyi). Only contacts who opted in to marketing email (latest consent = granted) receive them;
 * every email carries a one-click unsubscribe. Launch needs approval by someone other than the author.
 * Sent in batches by the scheduler (shared-hosting friendly) via Brevo when configured, else SMTP.
 */
class CampaignService
{
    public const BATCH = 150;

    public static function audience(array $a)
    {
        $latest = DB::table('consents')->selectRaw('contact_id, max(id) id')->where('channel', 'email')->groupBy('contact_id');

        return Contact::query()->whereNotNull('email')
            ->joinSub($latest, 'lc', 'lc.contact_id', '=', 'contacts.id')->join('consents as cs', 'cs.id', '=', 'lc.id')->where('cs.granted', true)
            ->when($a['units'] ?? null, fn ($q, $u) => $q->where(fn ($w) => $w->whereIn('contacts.primary_unit_id', $u)->orWhereHas('units', fn ($x) => $x->whereIn('business_units.id', $u))))
            ->when($a['lifecycle'] ?? null, fn ($q, $l) => $q->whereIn('contacts.lifecycle', $l))
            ->when($a['tags'] ?? null, fn ($q, $tags) => $q->where(fn ($w) => collect($tags)->each(fn ($t) => $w->orWhereJsonContains('contacts.tags', $t))))
            ->select('contacts.*');
    }

    /** Seyi drafts subject + body from the brief (public info only). */
    public function draft(Campaign $c): void
    {
        $r = app(AiGateway::class)->complete(Agents::agent('email')->brief."\n\nKnowledge base:\n".Agents::knowledge($c->brief, $c->unit_id, 3)."\n\nReply ONLY JSON: {\"subject\":\"...\",\"body\":\"plain text email, under 180 words, greeting uses {first_name}\"}", AiGateway::fence((string) $c->brief), 'heavy');
        $j = Money::extractJson($r['text']) ?? [];
        $c->forceFill(['subject' => mb_substr($j['subject'] ?? $c->name, 0, 190), 'body' => $j['body'] ?? $r['text']])->save();
        \App\Models\AiAction::create(['agent_key' => 'email', 'kind' => 'campaign', 'subject_type' => 'Campaign', 'subject_id' => $c->id, 'input_summary' => mb_substr((string) $c->brief, 0, 500), 'output' => $c->body, 'status' => 'done', 'provider' => $r['provider']]);
    }

    public function approve(Campaign $c, User $by): void
    {
        $c->refresh();
        if (! in_array($c->status, ['draft', 'pending_approval'], true) || ! $c->subject || ! $c->body) {
            throw new RuntimeException('Write the subject and body first.');
        }
        if ($c->created_by_id === $by->id && ! $by->isRole('super_admin')) {
            throw new RuntimeException('Another person must approve this campaign.');
        }
        DB::transaction(function () use ($c, $by) {
            $ids = self::audience($c->audience ?? [])->pluck('contacts.id');
            foreach ($ids->chunk(500) as $chunk) {
                CampaignRecipient::insertOrIgnore($chunk->map(fn ($id) => ['campaign_id' => $c->id, 'contact_id' => $id, 'status' => 'queued'])->all());
            }
            $c->forceFill(['status' => 'approved', 'approved_by_id' => $by->id, 'recipients' => $ids->count(), 'scheduled_at' => $c->scheduled_at ?? now()])->save();
        });
    }

    public static function unsubscribeUrl(Contact $contact): string
    {
        return URL::signedRoute('unsubscribe', ['contact' => $contact->id]);
    }

    /** Called every minute: sends the next batch of any due campaign. */
    public function sendBatch(): int
    {
        $n = 0;
        foreach (Campaign::whereIn('status', ['approved', 'sending'])->where('scheduled_at', '<=', now())->get() as $c) {
            $c->forceFill(['status' => 'sending'])->save();
            $batch = CampaignRecipient::where('campaign_id', $c->id)->where('status', 'queued')->with('contact')->limit(self::BATCH)->get();
            foreach ($batch as $rcp) {
                $contact = $rcp->contact;
                $body = strtr($c->body, ['{first_name}' => $contact->first_name ?: 'there', '{company}' => $contact->company?->name ?? ''])."\n\n—\nYou receive this because you opted in. Unsubscribe: ".self::unsubscribeUrl($contact);
                try {
                    $this->deliver($contact->email, $c->subject, $body, self::unsubscribeUrl($contact));
                    $rcp->forceFill(['status' => 'sent', 'sent_at' => now()])->save();
                    $n++;
                } catch (\Throwable $e) {
                    $rcp->forceFill(['status' => 'failed', 'error' => mb_substr($e->getMessage(), 0, 190)])->save();
                }
            }
            $c->forceFill([
                'sent_count' => CampaignRecipient::where('campaign_id', $c->id)->where('status', 'sent')->count(),
                'failed_count' => CampaignRecipient::where('campaign_id', $c->id)->where('status', 'failed')->count(),
            ])->save();
            if (! CampaignRecipient::where('campaign_id', $c->id)->where('status', 'queued')->exists()) {
                $c->forceFill(['status' => 'sent', 'sent_at' => now()])->save();
            }
        }

        return $n;
    }

    private function deliver(string $to, string $subject, string $body, string $unsub): void
    {
        if ($key = config('services.brevo.key')) {
            $from = config('mail.from');
            $r = Http::withHeaders(['api-key' => $key])->timeout(20)->post('https://api.brevo.com/v3/smtp/email', [
                'sender' => ['email' => $from['address'], 'name' => $from['name']], 'to' => [['email' => $to]], 'subject' => $subject, 'textContent' => $body,
                'headers' => ['List-Unsubscribe' => "<$unsub>"],
            ]);
            if (! $r->successful()) {
                throw new RuntimeException('Brevo '.$r->status());
            }

            return;
        }
        Mail::raw($body, function ($m) use ($to, $subject, $unsub) {
            $m->to($to)->subject($subject);
            $m->getSymfonyMessage()->getHeaders()->addTextHeader('List-Unsubscribe', "<$unsub>");
        });
    }
}
