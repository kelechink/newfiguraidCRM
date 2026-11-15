<?php

namespace App\Services;

use App\Domain\Telecom;
use App\Models\Activity;
use App\Models\Carrier;
use App\Models\RouteBroadcast;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use RuntimeException;

/**
 * Daily route offers: drafted by Telecom Ops, approved by a lead (never the author), then emailed to each
 * carrier's rates/commercial contacts with the deck as a CSV. Replies land in the telecom inbox.
 */
class BroadcastService
{
    public function approve(RouteBroadcast $b, User $by): void
    {
        $b->refresh();
        if ($b->status !== 'draft') {
            throw new RuntimeException('Only drafts can be approved.');
        }
        if ($b->created_by_id === $by->id && ! $by->isRole('super_admin')) {
            throw new RuntimeException('Another person must approve your broadcast.');
        }
        if ($b->rateDeck && ($b->rateDeck->direction !== 'sell' || $b->rateDeck->status !== 'active')) {
            throw new RuntimeException('Attach an approved, active sell deck.');
        }
        $b->forceFill(['status' => 'approved', 'approved_by_id' => $by->id])->save();
    }

    public static function csv(RouteBroadcast $b): string
    {
        $rows = [['Destination', 'Prefix', 'Rate', 'Currency', 'Billing', 'Effective']];
        foreach ($b->rateDeck?->rates()->orderBy('destination')->get() ?? [] as $r) {
            $rows[] = [$r->destination, $r->prefix, number_format((float) $r->rate, 5, '.', ''), $r->currency, $r->increment_first.'/'.$r->increment_next, $r->effective_from->toDateString()];
        }

        return implode("\r\n", array_map(fn ($row) => implode(',', array_map(fn ($v) => '"'.str_replace('"', '""', Telecom::csvCell($v)).'"', $row)), $rows))."\r\n";
    }

    public function send(RouteBroadcast $b): array
    {
        $b->refresh();
        if ($b->status !== 'approved') {
            throw new RuntimeException('Broadcast must be approved before sending.');
        }
        $csv = self::csv($b);
        $log = [];
        foreach (Carrier::whereIn('id', $b->recipient_carrier_ids ?? [])->with(['contacts', 'contact'])->get() as $c) {
            $emails = $c->contacts->filter(fn ($x) => $x->email && in_array($x->role, ['rates', 'commercial', null], true))->pluck('email')->push($c->contact?->email)->filter()->unique()->values();
            if ($emails->isEmpty()) {
                $log[] = ['carrier' => $c->name, 'status' => 'skipped: no email'];

                continue;
            }
            try {
                Mail::raw($b->body."\n\nRates attached. Reply to this email to request a route or test.\n\nFiguraid Telecom", function ($m) use ($emails, $b, $csv) {
                    $m->to($emails->all())->subject($b->subject)->attachData($csv, 'figuraid-rates-'.now()->format('Y-m-d').'.csv', ['mime' => 'text/csv']);
                    if ($reply = config('site.company.email')) {
                        $m->replyTo($reply);
                    }
                });
                if ($c->contact_id) {
                    Activity::create(['contact_id' => $c->contact_id, 'type' => 'email', 'summary' => "Route broadcast sent: {$b->subject}", 'data' => ['broadcast_id' => $b->id]]);
                }
                $log[] = ['carrier' => $c->name, 'status' => 'sent', 'to' => $emails->count()];
            } catch (\Throwable $e) {
                $log[] = ['carrier' => $c->name, 'status' => 'failed: '.mb_substr($e->getMessage(), 0, 120)];
            }
        }
        $b->forceFill(['status' => 'sent', 'sent_at' => now(), 'send_log' => $log])->save();

        return $log;
    }
}
