<?php

namespace App\Services;

use App\Models\Conversation;
use App\Models\Message;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

/** Sends a staff/agent reply out on the conversation's own channel. */
class ChannelSender
{
    public function send(Conversation $c, string $body, ?string $authorId, ?string $agentKey = null): Message
    {
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
        Mail::raw($body, fn ($m) => $m->to($to)->subject('Re: '.($c->subject ?: 'Your message to Figuraid')));

        return true;
    }
}
