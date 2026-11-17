<?php

namespace App\Services;

use App\Models\BusinessUnit;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Message;

/** One way in for every customer message (WhatsApp, Instagram, Facebook, email): contact, conversation, assignment, AI triage. */
class InboxIngest
{
    public function ingest(string $unitCode, string $channel, ?string $account, string $threadKey, string $externalId, string $body, ?string $name, ?string $phone = null, ?string $email = null, ?string $subject = null, ?string $category = null, string $priority = 'normal', array $attachments = []): ?Conversation
    {
        if (Message::where('external_id', $externalId)->exists()) {
            return null; // replay / duplicate delivery
        }
        $unit = BusinessUnit::where('code', $unitCode)->first() ?? BusinessUnit::first();
        $contact = null;
        if ($email) {
            $contact = Contact::where('email_normalized', strtolower($email))->first();
        } elseif ($phone) {
            $contact = Contact::where('phone_e164', preg_replace('/\D/', '', $phone))->first();
        }
        $contact ??= Contact::create(['primary_unit_id' => $unit->id, 'display_name' => $name ?: ($email ?? $phone ?? 'New contact'), 'email' => $email, 'phone' => $phone, 'source_channel' => $channel, 'source_detail' => $account, 'lifecycle' => 'lead']);
        $contact->forceFill(['last_activity_at' => now()])->saveQuietly();
        $conv = Conversation::where('channel', $channel)->where('external_thread_id', $threadKey)->where('channel_account', $account)->whereIn('status', ['open', 'pending'])->first();
        $new = ! $conv;
        $conv ??= Conversation::create(['unit_id' => $unit->id, 'contact_id' => $contact->id, 'channel' => $channel, 'channel_account' => $account, 'external_thread_id' => $threadKey, 'subject' => $subject, 'category' => $category, 'priority' => $priority]);
        Message::create(['conversation_id' => $conv->id, 'direction' => 'in', 'author_type' => 'contact', 'body' => $body, 'external_id' => $externalId, 'delivery' => 'delivered', 'attachments' => $attachments ?: null]);
        $conv->forceFill(['last_customer_message_at' => now(), 'status' => 'open'])->save();
        if ($new || ! $conv->assignee_id) {
            app(InboxRouter::class)->assign($conv);
        }
        if (! $category) {
            $c = $conv->fresh();
            dispatch(fn () => app(Agents::class)->triage($c))->afterResponse();
        }

        return $conv;
    }
}
