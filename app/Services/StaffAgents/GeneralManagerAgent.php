<?php

namespace App\Services\StaffAgents;

use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Goal;
use App\Models\Task;
use App\Models\Ticket;
use App\Models\User;
use App\Services\AgentMessenger;
use App\Services\InboxRouter;
use App\Services\Ops;
use App\Services\Whiteboard;

/**
 * General Manager agent: keeps work moving across all four units. It chases owners of overdue work, stalled
 * deals and unassigned customers, gives managers a morning list for their team, and sends the weekly review.
 * Operational data only (no money figures beyond pipeline counts).
 */
class GeneralManagerAgent
{
    public const KEY = 'gm';

    public function __construct(private AgentMessenger $m) {}

    private function people(array $roles)
    {
        return User::where('status', 'active')->whereHas('role', fn ($r) => $r->whereIn('key', $roles))->get();
    }

    /** 08:45 weekdays. */
    public function morning(): int
    {
        if (now('Africa/Lagos')->isWeekend()) {
            return 0;
        }
        $n = 0;
        $date = today()->toDateString();

        // Unassigned customer conversations and tickets → assign to someone working now
        foreach (Conversation::where('status', 'open')->whereNull('assignee_id')->get() as $c) {
            app(InboxRouter::class)->assign($c);
        }
        Ticket::where('status', 'open')->whereNull('assignee_id')->each(function ($t) {
            if ($u = InboxRouter::available($t->unit_id)->first()) {
                $t->forceFill(['assignee_id' => $u->id])->save();
                $this->m->tell(self::KEY, $u, "New ticket for you: $t->subject", 'I assigned this support ticket to you because you are on duty. Please respond today.', "/app/tickets/$t->id/edit", false);
            }
        });

        // Per-person overdue tasks (not the agents' own requests — those have their own follow-ups)
        $overdue = Task::whereNull('agent_key')->where('status', '!=', 'done')->where('due_at', '<', now())->whereNotNull('assignee_id')->with('assignee')->get()->groupBy('assignee_id');
        foreach ($overdue as $tasks) {
            $u = $tasks->first()->assignee;
            if ($u && AgentMessenger::once("gm:overdue:$u->id:$date")) {
                $list = $tasks->take(6)->map(fn ($t) => '• '.$t->title.' (due '.$t->due_at->format('j M').')')->implode("\n");
                $n += (int) $this->m->tell(self::KEY, $u, $tasks->count().' overdue task(s)', "Good morning. These are past due:\n$list\n\nFinish them or reply with a new date and what you need from me.", '/app/tasks', false);
            }
        }

        // Stalled deals: open, no next action date or it is >3 days past
        foreach (Deal::where('status', 'open')->where(fn ($q) => $q->whereNull('next_action_on')->orWhere('next_action_on', '<', today()->subDays(3)))->whereNotNull('owner_id')->with('owner')->get() as $d) {
            if ($d->owner) {
                $n += (int) (bool) $this->m->request(self::KEY, $d->owner, "Update the deal: $d->title", 'This deal has no current next step. Contact the customer, then set the next action and date (or mark it lost with a reason).', now()->addDay(), "deal-$d->id", '/app/deals-board');
            }
        }

        // Whiteboard: customers left waiting past the SLA yesterday (#slabreach), tasks overdue more than 3 days (#overdue)
        $wb = app(Whiteboard::class);
        foreach (Conversation::where('escalation_level', '>=', 2)->whereDate('updated_at', today()->subDay())->whereNotNull('assignee_id')->with('assignee')->get() as $c) {
            if ($c->assignee) {
                $wb->post(self::KEY, $c->assignee, ['slabreach'], 'left a customer ('.ucfirst($c->channel).') waiting past the 15-minute reply time.', 'Conversation', $c->id, "sla:$c->id");
            }
        }
        foreach (Task::whereNull('agent_key')->where('status', '!=', 'done')->where('due_at', '<', now()->subDays(3))->whereNotNull('assignee_id')->with('assignee')->get() as $t) {
            if ($t->assignee) {
                $wb->post(self::KEY, $t->assignee, ['overdue'], "has \"{$t->title}\" overdue since ".$t->due_at->format('j M').'.', 'Task', $t->id, "overdue:$t->id");
            }
        }

        // Manager digest: their team's overdue work and SLA breaches
        foreach ($this->people(['unit_manager', 'ops_manager']) as $mgr) {
            $team = $mgr->isRole('ops_manager') ? null : User::where('primary_unit_id', $mgr->primary_unit_id)->pluck('id');
            $od = Task::where('status', '!=', 'done')->where('due_at', '<', now())->when($team, fn ($q) => $q->whereIn('assignee_id', $team))->count();
            $sla = Conversation::where('status', 'open')->whereNull('first_response_at')->where('sla_due_at', '<', now())->when($team, fn ($q) => $q->whereIn('assignee_id', $team))->count();
            $stuck = Deal::where('status', 'open')->whereNull('next_action_on')->when($team, fn ($q) => $q->whereIn('owner_id', $team))->count();
            if (($od || $sla || $stuck) && AgentMessenger::once("gm:digest:$mgr->id:$date")) {
                $n += (int) $this->m->tell(self::KEY, $mgr, 'Your team this morning', "• Overdue tasks: $od\n• Customers waiting past the 15-minute SLA: $sla\n• Deals without a next step: $stuck\n\nI have already messaged the people involved.", '/app');
            }
        }

        return $n;
    }

    /** Friday 16:30 — weekly review to leadership + OKR nudges. */
    public function weekly(): int
    {
        if (! AgentMessenger::once('gm:weekly:'.now()->format('o-W'), 6 * 86400)) {
            return 0;
        }
        $from = now()->startOfWeek();
        $f = Ops::briefFacts();
        $body = "Week of ".$from->format('j M')."\n"
            .'• Tasks completed: '.Task::where('completed_at', '>=', $from)->count().' · still overdue: '.Task::where('status', '!=', 'done')->where('due_at', '<', now())->count()."\n"
            .'• New leads: '.\App\Models\Contact::where('created_at', '>=', $from)->count().' · deals won: '.Deal::where('won_at', '>=', $from)->count().' · lost: '.Deal::where('lost_at', '>=', $from)->count()."\n"
            .'• Conversations: '.Conversation::where('created_at', '>=', $from)->count().' · escalated: '.Conversation::where('created_at', '>=', $from)->where('escalation_level', '>', 0)->count()."\n"
            .'• Late arrivals: '.\App\Models\AttendanceDay::where('date', '>=', $from->toDateString())->where('status', 'late')->count().' · absences: '.\App\Models\AttendanceDay::where('date', '>=', $from->toDateString())->where('status', 'absent')->count()."\n"
            .'• Renewals next 7 days: '.$f['Renewals in 7 days'];
        $n = 0;
        foreach ($this->people(['super_admin', 'admin', 'ops_manager']) as $u) {
            $n += (int) $this->m->tell(self::KEY, $u, 'Weekly operations review', $body, '/app');
        }
        $qs = now()->startOfQuarter();
        $pace = $qs->diffInDays(now()) / max(1, $qs->diffInDays($qs->copy()->endOfQuarter()));
        foreach (Goal::where('quarter', now()->year.'-Q'.now()->quarter)->with(['owner', 'keyResults'])->get() as $g) {
            $behind = $g->keyResults->filter(fn ($k) => $k->target > 0 && $k->current / $k->target < $pace - 0.15);
            if ($g->owner && $behind->isNotEmpty()) {
                $n += (int) $this->m->tell(self::KEY, $g->owner, "OKR behind pace: $g->objective", $behind->map(fn ($k) => "• $k->title: ".number_format((float) $k->current).' of '.number_format((float) $k->target))->implode("\n")."\n\nWhat will change next week? Update the numbers when you can.", '/app/goals', false);
            }
        }
        $this->m->announce(self::KEY, 'Have a good weekend, everyone. Please clock out before you leave and send your end-of-day report. — '.\App\Models\AiAgent::where('key', self::KEY)->value('name'));

        return $n;
    }
}
