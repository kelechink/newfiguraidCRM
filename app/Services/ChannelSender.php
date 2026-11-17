<?php

namespace App\Services;

use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

/** Sends a staff/agent reply out on the conversation's own channel. */
class ChannelSender
{
    /** WhatsApp only allows free text within 24 hours of the customer's last message; after that, an approved template. */
    public static function insideWindow(Conversation $c): bool
    {
        return $c->channel !== 'whatsapp' || ($c->last_customer_message_at && $c->last_customer_message_at->gt(now()->subHours(24)));
    }

    public function sendTemplate(Conversation $c, \App\Models\WhatsappTemplate $t, array $params, ?string $authorId): Message
    {
        $preview = preg_replace_callback('/\{\{(\d+)\}\}/', fn ($m) => $params[(int) $m[1] - 1] ?? '', $t->body);
        $m = Message::create(['conversation_id' => $c->id, 'direction' => 'out', 'author_type' => 'staff', 'author_id' => $authorId, 'body' => $preview, 'delivery' => 'queued']);
        $token = config('services.meta.whatsapp_token');
        $ok = false;
        if ($token && $c->channel_account) {
            $ok = Http::withToken($token)->post("https://graph.facebook.com/v21.0/{$c->channel_account}/messages", [
                'messaging_product' => 'whatsapp', 'to' => $c->external_thread_id, 'type' => 'template',
                'template' => ['name' => $t->name, 'language' => ['code' => $t->language], 'components' => $params ? [['type' => 'body', 'parameters' => array_map(fn ($p) => ['type' => 'text', 'text' => mb_substr((string) $p, 0, 900)], array_values($params))]] : []],
            ])->successful();
        }
        $m->forceFill(['delivery' => $ok ? 'sent' : 'failed'])->save();
        $c->forceFill(['first_response_at' => $c->first_response_at ?? now()])->save();

        return $m;
    }

    public function send(Conversation $c, string $body, ?string $authorId, ?string $agentKey = null): Message
    {
        if (! self::insideWindow($c)) {
            throw new \RuntimeException('The 24-hour WhatsApp window has closed — send an approved template instead.');
        }
        $m = Message::create(['conversation_id' => $c->id, 'direction' => 'out', 'author_type' => $agentKey ? 'agent' : 'staff', 'author_id' => $authorId, 'agent_key' => $agentKey, 'body' => $body, 'delivery' => 'queued']);
        try {
            $ok = match ($c->channel) {
                'whatsapp' => $this->whatsapp($c, $body),
                'facebook', 'instagram' => $this->messenger($c, $body),
                'email' => $this->email($c, $body),
                default => true, // webchat / teams log / phone: stored in the thread
            };
            $m->forceFill(['delivery' => $ok ? 'sent' : 'failed'])->save();
        } catch (\Throwable) {
            $m->forceFill(['delivery' => 'failed'])->save();
        }
        $c->forceFill(['first_response_at' => $c->first_response_at ?? now(), 'status' => $c->status === 'resolved' ? 'open' : $c->status])->save();
        $c->contact?->forceFill(['last_activity_at' => now()])->saveQuietly();

        return $m;
    }

    private function whatsapp(Conversation $c, string $body): bool
    {
        $token = config('services.meta.whatsapp_token');
        if (! $token || ! $c->channel_account) {
            return false;
        }

        return Http::withToken($token)->post("https://graph.facebook.com/v21.0/{$c->channel_account}/messages", ['messaging_product' => 'whatsapp', 'to' => $c->external_thread_id, 'type' => 'text', 'text' => ['body' => $body]])->successful();
    }

    private function messenger(Conversation $c, string $body): bool
    {
        $token = config('services.meta.page_token');

        return $token && Http::withToken($token)->post('https://graph.facebook.com/v21.0/me/messages', ['recipient' => ['id' => $c->external_thread_id], 'message' => ['text' => $body], 'messaging_type' => 'RESPONSE'])->successful();
    }

    private function email(Conversation $c, string $body): bool
    {
        $to = $c->contact?->email;
        if (! $to) {
            return false;
        }
        $from = collect(config('mailboxes.boxes'))->first(fn ($b) => strtolower($b['address']) === strtolower((string) $c->channel_account))['address'] ?? config('mailboxes.send_as.system');
        Mail::raw($body, function ($m) use ($to, $c, $from) {
            $m->to($to)->subject(str_starts_with((string) $c->subject, 'Re:') ? $c->subject : 'Re: '.($c->subject ?: 'Your message to Figuraid'))->from($from, 'Figuraid')->replyTo($from);
        });

        return true;
    }
}
