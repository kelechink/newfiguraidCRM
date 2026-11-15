<?php

namespace App\Http\Controllers;

use App\Models\BusinessUnit;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Message;
use App\Services\Agents;
use App\Services\InboxRouter;
use App\Services\Payments;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class WebhookController extends Controller
{
    public function paystack(Request $r, Payments $p)
    {
        abort_unless(Payments::verifyPaystackSignature($r->getContent(), $r->header('x-paystack-signature')), 401);
        $ref = (string) $r->input('data.reference');
        if ($r->input('event') === 'charge.success' && $ref && Payments::firstDelivery('paystack', $r->input('event').':'.$ref)) {
            $p->confirmPaystack($ref); // re-verified against the Paystack API
        }

        return response()->noContent();
    }

    public function flutterwave(Request $r, Payments $p)
    {
        abort_unless(Payments::verifyFlutterwaveSignature($r->header('verif-hash')), 401);
        $id = (string) $r->input('data.id');
        if ($id && Payments::firstDelivery('flutterwave', $id)) {
            $p->confirmFlutterwave($id);
        }

        return response()->noContent();
    }

    public function metaVerify(Request $r)
    {
        $token = config('services.meta.verify_token');
        abort_unless($token && $r->query('hub_mode') === 'subscribe' && hash_equals($token, (string) $r->query('hub_verify_token')), 403);

        return response((string) $r->query('hub_challenge'));
    }

    /** WhatsApp Cloud API, Instagram and Facebook Messenger. */
    public function meta(Request $r)
    {
        $secret = config('services.meta.app_secret');
        $sig = (string) $r->header('x-hub-signature-256');
        abort_unless($secret && hash_equals('sha256='.hash_hmac('sha256', $r->getContent(), $secret), $sig), 401);
        $object = $r->input('object');
        foreach ($r->input('entry', []) as $entry) {
            if ($object === 'whatsapp_business_account') {
                foreach ($entry['changes'] ?? [] as $ch) {
                    $v = $ch['value'] ?? [];
                    $phoneId = $v['metadata']['phone_number_id'] ?? null;
                    $unitCode = array_search($phoneId, config('services.meta.whatsapp_numbers'), true) ?: 'FIGUREWEB';
                    foreach ($v['messages'] ?? [] as $m) {
                        $name = collect($v['contacts'] ?? [])->firstWhere('wa_id', $m['from'])['profile']['name'] ?? null;
                        $this->ingest($unitCode, 'whatsapp', $phoneId, $m['from'], $m['id'], $m['text']['body'] ?? '['.($m['type'] ?? 'message').']', $name, phone: $m['from']);
                    }
                }
            } elseif (in_array($object, ['instagram', 'page'], true)) {
                foreach ($entry['messaging'] ?? [] as $m) {
                    if (! empty($m['message']['is_echo']) || empty($m['message'])) {
                        continue;
                    }
                    $this->ingest('TELECOM', $object === 'page' ? 'facebook' : 'instagram', $entry['id'] ?? null, $m['sender']['id'], $m['message']['mid'] ?? uniqid(), $m['message']['text'] ?? '[attachment]', null);
                }
            }
        }

        return response()->noContent();
    }

    /** Inbound email via cPanel pipe / forwarding service: JSON {from, name, to, subject, text, message_id}, HMAC header. */
    public function email(Request $r)
    {
        $secret = config('services.inbound_email.secret');
        abort_unless($secret && hash_equals(hash_hmac('sha256', $r->getContent(), $secret), (string) $r->header('x-signature')), 401);
        $to = strtolower((string) $r->input('to'));
        $unit = str_contains($to, 'academy') ? 'ACADEMY' : (str_contains($to, 'figureweb') || str_contains($to, 'support') ? 'FIGUREWEB' : (str_contains($to, 'procure') ? 'PROCUREMENT' : 'TELECOM'));
        $this->ingest($unit, 'email', $to, strtolower((string) $r->input('from')), (string) $r->input('message_id', uniqid('em')), mb_substr((string) $r->input('text'), 0, 20000), $r->input('name'), email: strtolower((string) $r->input('from')), subject: $r->input('subject'));

        return response()->noContent();
    }

    private function ingest(string $unitCode, string $channel, ?string $account, string $threadKey, string $externalId, string $body, ?string $name, ?string $phone = null, ?string $email = null, ?string $subject = null): void
    {
        if (Message::where('external_id', $externalId)->exists()) {
            return; // replay / duplicate delivery
        }
        $unit = BusinessUnit::where('code', $unitCode)->first() ?? BusinessUnit::first();
        $contact = null;
        if ($email) {
            $contact = Contact::where('email_normalized', $email)->first();
        } elseif ($phone) {
            $contact = Contact::where('phone_e164', preg_replace('/\D/', '', $phone))->first();
        }
        $contact ??= Contact::create(['primary_unit_id' => $unit->id, 'display_name' => $name ?: ($email ?? $phone ?? 'New contact'), 'email' => $email, 'phone' => $phone, 'source_channel' => $channel, 'lifecycle' => 'lead']);
        $contact->forceFill(['last_activity_at' => now()])->saveQuietly();
        $conv = Conversation::where('channel', $channel)->where('external_thread_id', $threadKey)->whereIn('status', ['open', 'pending'])->first();
        $new = ! $conv;
        $conv ??= Conversation::create(['unit_id' => $unit->id, 'contact_id' => $contact->id, 'channel' => $channel, 'channel_account' => $account, 'external_thread_id' => $threadKey, 'subject' => $subject]);
        Message::create(['conversation_id' => $conv->id, 'direction' => 'in', 'author_type' => 'contact', 'body' => $body, 'external_id' => $externalId, 'delivery' => 'delivered']);
        $conv->forceFill(['last_customer_message_at' => now(), 'status' => 'open'])->save();
        if ($new || ! $conv->assignee_id) {
            app(InboxRouter::class)->assign($conv);
        }
        dispatch(fn () => app(Agents::class)->triage($conv->fresh()))->afterResponse();
        Log::info('inbox.ingest', ['channel' => $channel, 'conversation' => $conv->id]);
    }
}
