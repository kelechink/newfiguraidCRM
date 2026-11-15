<?php

namespace App\Services;

use App\Models\Contact;
use App\Notifications\Alert;
use Illuminate\Support\Facades\DB;

/**
 * Leads not followed up for 90 days are deleted (management rule). Owners are warned at day 83.
 * Never deletes anyone with a won deal, invoice, payment, ticket, enrolment or subscription.
 */
class Retention
{
    public const DAYS = 90;

    public const WARN = 83;

    public static function eligible()
    {
        return Contact::query()->where('lifecycle', 'lead')
            ->whereDoesntHave('deals', fn ($q) => $q->where('status', 'won'))
            ->whereNotExists(fn ($q) => $q->from('invoices')->whereColumn('invoices.contact_id', 'contacts.id'))
            ->whereNotExists(fn ($q) => $q->from('payments')->whereColumn('payments.contact_id', 'contacts.id'))
            ->whereNotExists(fn ($q) => $q->from('tickets')->whereColumn('tickets.contact_id', 'contacts.id'))
            ->whereNotExists(fn ($q) => $q->from('enrolments')->whereColumn('enrolments.contact_id', 'contacts.id'))
            ->whereNotExists(fn ($q) => $q->from('subscriptions')->whereColumn('subscriptions.contact_id', 'contacts.id'));
    }

    public static function lastTouch(): string
    {
        return 'COALESCE(contacts.last_activity_at, contacts.created_at)';
    }

    public function run(): array
    {
        $warned = 0;
        self::eligible()->whereRaw(self::lastTouch().' < ?', [now()->subDays(self::WARN)])->whereRaw(self::lastTouch().' >= ?', [now()->subDays(self::WARN + 1)])->with('owner')->each(function ($c) use (&$warned) {
            $c->owner?->notify(new Alert('Lead will be deleted in 7 days', "{$c->display_name} has had no follow-up for 83 days.", "/app/contacts/{$c->id}"));
            $warned++;
        });
        $deleted = 0;
        self::eligible()->whereRaw(self::lastTouch().' < ?', [now()->subDays(self::DAYS)])->each(function ($c) use (&$deleted) {
            DB::transaction(fn () => $c->forceDelete());
            $deleted++;
        });

        return compact('warned', 'deleted');
    }
}
