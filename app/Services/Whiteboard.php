<?php

namespace App\Services;

use App\Models\AttendanceDay;
use App\Models\AttendanceExcuse;
use App\Models\ChatChannel;
use App\Models\Setting;
use App\Models\User;
use App\Models\WhiteboardPost;
use App\Notifications\Alert;
use Illuminate\Database\UniqueConstraintViolationException;

/**
 * The Whiteboard: a company-wide board everyone can see. AI colleagues (and HR/managers) tag staff with hashtags
 * for rule breaks (call-outs) and for good work (kudos). Each post also appears in #General with the hashtag.
 * Call-outs are factual and system-verified only; they are taken down automatically when the record changes
 * (an approved excuse, leave or off-site approval, a waived deduction) and expire after 30 days.
 */
class Whiteboard
{
    /** tag => [label, kind] */
    public const TAGS = [
        'late' => ['Arrived after 09:00', 'callout'],
        'earlysignoff' => ['Signed off before 17:00', 'callout'],
        'absent' => ['Absent without approved leave or excuse', 'callout'],
        'noshow' => ['Clocked in but never clocked out', 'callout'],
        'noreport' => ['No end-of-day report', 'callout'],
        'noexplanation' => ['Did not explain an absence after reminders', 'callout'],
        'overdue' => ['Task overdue after reminders', 'callout'],
        'slabreach' => ['Customer left waiting past the SLA', 'callout'],
        'stalleddeal' => ['Deal left without a next step', 'callout'],
        'missingreceipt' => ['Expense receipt not uploaded', 'callout'],
        'contractpending' => ['Contract pack not signed', 'callout'],
        'perfectweek' => ['On time every day this week', 'kudos'],
        'topperformer' => ['Top of the staff points', 'kudos'],
        'goalmet' => ['Hit a weekly target', 'kudos'],
        'shoutout' => ['Recognised by a colleague', 'kudos'],
    ];

    public const EXPIRY_DAYS = 30;

    public static function enabled(string $kind = 'callout'): bool
    {
        return $kind !== 'callout' || (bool) Setting::get('whiteboard.callouts_enabled', true);
    }

    /** Post to the board (once per dedupe key). Returns null when disabled or a duplicate. */
    public function post(?string $agentKey, User $subject, array $tags, string $body, ?string $sourceType = null, ?string $sourceId = null, ?string $dedupe = null, ?User $author = null): ?WhiteboardPost
    {
        $tags = array_values(array_filter($tags, fn ($t) => isset(self::TAGS[$t])));
        if (! $tags || ! in_array($subject->status, ['active', 'onboarding'], true)) {
            return null;
        }
        $kind = self::TAGS[$tags[0]][1];
        if (! self::enabled($kind) || ($agentKey && ! AgentMessenger::agent($agentKey))) {
            return null;
        }
        try {
            $p = WhiteboardPost::create(['kind' => $kind, 'agent_key' => $agentKey, 'author_id' => $author?->id, 'subject_user_id' => $subject->id, 'body' => $body, 'hashtags' => $tags,
                'source_type' => $sourceType, 'source_id' => $sourceId, 'dedupe_key' => $dedupe, 'expires_at' => $kind === 'callout' ? now()->addDays(self::EXPIRY_DAYS) : now()->addDays(90)]);
        } catch (UniqueConstraintViolationException) {
            return null;
        }
        $line = implode(' ', array_map(fn ($t) => "#$t", $tags))." @{$subject->name} — $body";
        $general = ChatChannel::firstOrCreate(['kind' => 'general', 'name' => 'General']);
        $general->messages()->create(['agent_key' => $agentKey, 'author_id' => $agentKey ? null : $author?->id, 'body' => $line, 'tags' => $tags, 'mentions' => [$subject->id]]);
        $subject->notify(new Alert($kind === 'kudos' ? 'You were recognised on the Whiteboard' : 'You were tagged on the Whiteboard', $line.($kind === 'callout' ? ' — if this is wrong, use "Dispute" on the Whiteboard.' : ''), '/app/whiteboard'));

        return $p;
    }

    public function retract(WhiteboardPost $p, ?User $by, string $reason): void
    {
        if ($p->retracted_at) {
            return;
        }
        $p->forceFill(['retracted_at' => now(), 'retracted_by_id' => $by?->id, 'retract_reason' => mb_substr($reason, 0, 250)])->save();
        $p->subject?->notify(new Alert('Whiteboard post removed', implode(' ', array_map(fn ($t) => "#$t", $p->hashtags)).' — '.$reason, '/app/whiteboard'));
    }

    /** Re-check attendance call-outs for a day against the current record (status, excuses). */
    public function reconcileDay(AttendanceDay $d): void
    {
        $posts = WhiteboardPost::where('source_type', 'AttendanceDay')->where('source_id', $d->id)->whereNull('retracted_at')->get();
        if ($posts->isEmpty()) {
            return;
        }
        $excused = AttendanceExcuse::where('attendance_day_id', $d->id)->where('status', 'approved')->exists();
        foreach ($posts as $p) {
            $still = ! $excused && match ($p->hashtags[0] ?? '') {
                'late' => $d->status === 'late',
                'earlysignoff' => $d->minutes_early > 0 && in_array($d->status, ['present', 'late'], true),
                'absent', 'noshow' => $d->status === 'absent',
                default => true,
            };
            if (! $still) {
                $this->retract($p, null, $excused ? 'Excuse approved' : 'Attendance record corrected');
            }
        }
    }

    /** A waived deduction takes down the matching call-out. */
    public function retractForDeduction(?string $dayId, string $deductionType, ?User $by): void
    {
        $tags = ['lateness' => ['late'], 'early_departure' => ['earlysignoff'], 'absence' => ['absent', 'noshow']][$deductionType] ?? [];
        WhiteboardPost::where('source_type', 'AttendanceDay')->where('source_id', $dayId)->whereNull('retracted_at')->get()
            ->filter(fn ($p) => in_array($p->hashtags[0] ?? '', $tags, true))->each(fn ($p) => $this->retract($p, $by, 'Deduction waived by HR'));
    }
}
