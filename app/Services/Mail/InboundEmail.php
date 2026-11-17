<?php

namespace App\Services\Mail;

use App\Models\User;
use App\Notifications\Alert;
use App\Services\InboxIngest;
use Illuminate\Support\Facades\DB;

/** Routes one received email by the mailbox it reached: rates@ → rate intake; others → the inbox with their category. */
class InboundEmail
{
    public static function boxFor(array $to, ?string $hint = null): ?string
    {
        if ($hint) {
            return $hint;
        }
        foreach (config('mailboxes.boxes') as $key => $b) {
            if (array_intersect($to, array_map('strtolower', array_merge([$b['address']], $b['aliases'] ?? [])))) {
                return $key;
            }
        }

        return null;
    }

    public function process(string $raw, ?string $boxKey = null): array
    {
        $e = ParsedEmail::fromRaw($raw);
        $key = self::boxFor($e->to, $boxKey) ?? 'info';
        $box = config("mailboxes.boxes.$key");
        // never process the same email twice, and ignore our own outgoing copies / auto-replies
        if (DB::table('webhook_events')->insertOrIgnore(['provider' => 'mail', 'event_id' => substr($e->messageId, 0, 120), 'received_at' => now()]) === 0) {
            return ['skipped' => 'duplicate'];
        }
        $ours = collect(config('mailboxes.boxes'))->pluck('address')->map(fn ($a) => strtolower($a))->all();
        if (! $e->fromEmail || in_array($e->fromEmail, $ours, true) || preg_match('/^(mailer-daemon|postmaster|no-?reply)@/i', $e->fromEmail)) {
            return ['skipped' => 'system sender'];
        }

        try {
            return $this->route($e, $key, $box);
        } catch (\Throwable $ex) {
            DB::table('webhook_events')->where(['provider' => 'mail', 'event_id' => substr($e->messageId, 0, 120)])->delete(); // retry next run

            throw $ex;
        }
    }

    private function route(ParsedEmail $e, string $key, array $box): array
    {
        if ($key === 'rates') {
            $r = app(RateIntake::class)->handle($e);
            if (! $r['decks']) {
                // nothing machine-readable: a person reads it in the telecom inbox
                $this->toInbox($e, $box, 'rates', 'Rate email needs a person'.($r['unread'] ? ': '.implode(', ', $r['unread']) : ''));
            }

            return ['box' => $key] + $r;
        }

        $conv = $this->toInbox($e, $box, $box['category'], null);
        foreach ($box['notify'] ?? [] as $role) {
            User::where('status', 'active')->whereHas('role', fn ($q) => $q->where('key', $role))->get()
                ->each->notify(new Alert(ucfirst($key).'@ email: '.($e->subject ?: '(no subject)'), mb_substr($e->text, 0, 160), $conv ? "/app/conversations/$conv->id/edit" : null));
        }

        return ['box' => $key, 'conversation' => $conv?->id];
    }

    private function toInbox(ParsedEmail $e, array $box, ?string $category, ?string $note)
    {
        $body = trim(($note ? "[$note]\n" : '').$e->text);
        $files = array_map(fn ($a) => ['name' => $a['name'], 'mime' => $a['mime'], 'size' => strlen($a['content'])], $e->attachments);

        return app(InboxIngest::class)->ingest($box['unit'], 'email', strtolower($box['address']), $e->fromEmail, 'mail:'.substr($e->messageId, 0, 180), $body ?: '(no text)', $e->fromName,
            email: $e->fromEmail, subject: $e->subject, category: $category, priority: $box['priority'] ?? 'normal', attachments: $files);
    }
}
