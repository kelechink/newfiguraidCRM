<?php

namespace App\Services;

use App\Models\Booking;
use App\Models\Document;
use App\Models\LeaveRequest;
use App\Models\Subscription;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * Calendar sync without OAuth: each person gets a private iCal feed (tasks due, bookings, leave, renewals they own)
 * that Google Calendar / Outlook subscribe to. Booking confirmations carry an .ics invite.
 */
class CalendarFeed
{
    public static function tokenFor(User $u): string
    {
        if (! $u->calendar_token) {
            $u->forceFill(['calendar_token' => Str::random(48)])->saveQuietly();
        }

        return $u->calendar_token;
    }

    private static function esc(string $s): string
    {
        return str_replace(["\\", ';', ',', "\r\n", "\n"], ['\\\\', '\;', '\,', '\n', '\n'], $s);
    }

    public static function event(string $uid, \DateTimeInterface $start, ?\DateTimeInterface $end, string $title, string $desc = '', bool $allDay = false, ?string $organizer = null, ?string $attendee = null): string
    {
        $fmt = fn ($d) => $allDay ? 'VALUE=DATE:'.$d->format('Ymd') : ':'.(clone $d)->setTimezone(new \DateTimeZone('UTC'))->format('Ymd\THis\Z');
        $lines = ['BEGIN:VEVENT', "UID:$uid@figuraid", 'DTSTAMP:'.now('UTC')->format('Ymd\THis\Z'), 'DTSTART'.$fmt($start)];
        if ($end) {
            $lines[] = 'DTEND'.$fmt($end);
        }
        $lines[] = 'SUMMARY:'.self::esc($title);
        if ($desc) {
            $lines[] = 'DESCRIPTION:'.self::esc($desc);
        }
        if ($organizer) {
            $lines[] = 'ORGANIZER:mailto:'.$organizer;
        }
        if ($attendee) {
            $lines[] = 'ATTENDEE;RSVP=TRUE:mailto:'.$attendee;
        }
        $lines[] = 'END:VEVENT';

        return implode("\r\n", $lines);
    }

    public static function wrap(array $events, string $name = 'Figuraid', string $method = 'PUBLISH'): string
    {
        return implode("\r\n", array_merge(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Figuraid OS//EN', 'CALSCALE:GREGORIAN', "METHOD:$method", 'X-WR-CALNAME:'.self::esc($name)], $events, ['END:VCALENDAR']))."\r\n";
    }

    public static function forUser(User $u): string
    {
        $ev = [];
        foreach (Task::where('assignee_id', $u->id)->where('status', '!=', 'done')->whereNotNull('due_at')->where('due_at', '>=', now()->subDays(14))->get() as $t) {
            $ev[] = self::event("task-$t->id", $t->due_at, $t->due_at->copy()->addMinutes(30), 'Task: '.$t->title, url('/app/tasks/'.$t->id.'/edit'));
        }
        foreach (Booking::where('user_id', $u->id)->where('starts_at', '>=', now()->subDays(14))->get() as $b) {
            $ev[] = self::event("booking-$b->id", $b->starts_at, $b->starts_at->copy()->addMinutes($b->minutes), "Call with $b->name", (string) $b->notes);
        }
        foreach (LeaveRequest::where('user_id', $u->id)->where('status', 'approved')->where('end_date', '>=', now()->subDays(30))->get() as $l) {
            $ev[] = self::event("leave-$l->id", $l->start_date, $l->end_date->copy()->addDay(), 'Leave ('.$l->type.')', '', true);
        }
        if ($u->canDo('subscriptions')) {
            foreach (Subscription::whereIn('status', ['active', 'pending'])->whereBetween('next_due_on', [today(), today()->addDays(60)])->get() as $s) {
                $ev[] = self::event("sub-$s->id-".$s->next_due_on->format('Ymd'), $s->next_due_on, $s->next_due_on->copy()->addDay(), 'Renewal: '.$s->name, '', true);
            }
        }
        foreach (Document::where('owner_id', $u->id)->whereNotNull('expires_on')->where('expires_on', '>=', today())->get() as $d) {
            $ev[] = self::event("doc-$d->id", $d->expires_on, $d->expires_on->copy()->addDay(), 'Expires: '.$d->title, '', true);
        }

        return self::wrap($ev, 'Figuraid — '.$u->name);
    }
}
