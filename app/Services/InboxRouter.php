<?php

namespace App\Services;

use App\Models\AttendanceDay;
use App\Models\Conversation;
use App\Models\LeaveRequest;
use App\Models\Setting;
use App\Models\Task;
use App\Models\User;
use App\Notifications\Alert;

/**
 * Assignment & SLA (PRD v3 §5): assign to someone in the unit who is clocked in today and not on leave
 * (round-robin by fewest open conversations). SLA 15 min: reminder → reassign → unit manager → Ops Manager.
 * A conversation cannot be resolved without a reply or a resolution note.
 */
class InboxRouter
{
    public static function slaMinutes(): int
    {
        return (int) Setting::get('inbox.sla_minutes', 15);
    }

    /** Staff who can take a conversation now. */
    public static function available(string $unitId, ?string $exceptId = null)
    {
        $today = AttendanceService::today();
        $clockedIn = AttendanceDay::where('date', $today)->whereNotNull('first_in_at')->whereNull('last_out_at')->pluck('user_id');
        $onLeave = LeaveRequest::where('status', 'approved')->whereDate('start_date', '<=', $today)->whereDate('end_date', '>=', $today)->pluck('user_id');

        return User::query()->where('status', 'active')
            ->where(fn ($q) => $q->where('primary_unit_id', $unitId)->orWhereHas('units', fn ($u) => $u->where('business_units.id', $unitId)))
            ->whereIn('id', $clockedIn)->whereNotIn('id', $onLeave)->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
            ->get()->filter(fn ($u) => $u->canDo('inbox', 'edit'))
            ->sortBy(fn ($u) => Conversation::where('assignee_id', $u->id)->where('status', 'open')->count())->values();
    }

    public function assign(Conversation $c, ?string $exceptId = null): ?User
    {
        $u = self::available($c->unit_id, $exceptId)->first();
        $c->forceFill(['assignee_id' => $u?->id, 'sla_due_at' => now()->addMinutes(self::slaMinutes())])->save();
        $u?->notify(new Alert('New conversation', ($c->subject ?: 'Message on '.$c->channel).' — reply within '.self::slaMinutes().' minutes.', "/app/conversations/$c->id"));

        return $u;
    }

    /** Run every minute from the scheduler. */
    public function escalate(): int
    {
        $n = 0;
        $sla = self::slaMinutes();
        Conversation::where('status', 'open')->whereNull('first_response_at')->whereNotNull('sla_due_at')->where('sla_due_at', '<', now())->each(function (Conversation $c) use (&$n, $sla) {
            $n++;
            $level = $c->escalation_level + 1;
            $link = "/app/conversations/$c->id";
            switch ($level) {
                case 1:
                    $c->assignee?->notify(new Alert('Reply overdue', "A customer has waited over $sla minutes.", $link));
                    break;
                case 2:
                    $this->assign($c, $c->assignee_id);
                    break;
                case 3:
                    User::whereHas('role', fn ($r) => $r->where('key', 'unit_manager'))->where('primary_unit_id', $c->unit_id)->get()->each->notify(new Alert('SLA breach', 'Conversation unanswered after reassignment.', $link));
                    break;
                default:
                    User::whereHas('role', fn ($r) => $r->where('key', 'ops_manager'))->get()->each->notify(new Alert('SLA breach — Ops', 'Conversation still unanswered.', $link));
                    if (! Task::where('conversation_id', $c->id)->exists()) {
                        Task::create(['title' => 'Unanswered customer conversation', 'unit_id' => $c->unit_id, 'priority' => 'urgent', 'origin' => 'system', 'conversation_id' => $c->id, 'assignee_id' => $c->assignee_id, 'due_at' => now()->addMinutes(30)]);
                    }
            }
            $c->forceFill(['escalation_level' => min(4, $level), 'sla_due_at' => now()->addMinutes($sla)])->save();
        });

        return $n;
    }

    public static function canResolve(Conversation $c): bool
    {
        return trim((string) $c->resolution_note) !== '' || $c->messages()->where('direction', 'out')->whereIn('author_type', ['staff', 'agent'])->where('delivery', '!=', 'draft')->exists();
    }
}
