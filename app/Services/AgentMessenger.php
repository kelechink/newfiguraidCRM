<?php

namespace App\Services;

use App\Models\AiAction;
use App\Models\AiAgent;
use App\Models\ChatChannel;
use App\Models\Setting;
use App\Models\Task;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

/**
 * How staff agents (HR, Accountant, General Manager) talk to colleagues — only inside the platform: a direct
 * message in Team chat, the bell, #General and the Whiteboard. They have no email accounts. Every message is logged.
 * Guardrails: a daily cap per person, quiet hours respected, duplicate messages suppressed.
 */
class AgentMessenger
{
    public static function agent(string $key): ?AiAgent
    {
        $a = AiAgent::where('key', $key)->first();

        return $a && $a->status === 'active' ? $a : null;
    }

    /** Run something once per key in a window (e.g. "hr:not-clocked-in:{user}:{date}"). */
    public static function once(string $key, int $seconds = 86400): bool
    {
        return Cache::add('agent-once:'.$key, 1, $seconds);
    }

    /** The agent's private chat channel with one colleague. */
    public static function channel(AiAgent $a, User $u): ChatChannel
    {
        $c = ChatChannel::firstOrCreate(['direct_key' => "agent:$a->key:$u->id"], ['kind' => 'direct', 'name' => $a->name.' ('.$a->role.')', 'agent_key' => $a->key]);
        $c->members()->syncWithoutDetaching([$u->id]);

        return $c;
    }

    private static function inQuietHours(User $u): bool
    {
        $q = $u->quiet_hours;
        if (! $q || count($q) !== 2) {
            return false;
        }
        $now = now('Africa/Lagos')->format('H:i');

        return $q[0] > $q[1] ? ($now >= $q[0] || $now < $q[1]) : ($now >= $q[0] && $now < $q[1]);
    }

    /**
     * Send a message to a colleague inside the platform: a direct message in Team chat, plus a bell notification
     * when $bell is true. Agents have no email accounts. Returns false when suppressed (cap / agent paused).
     */
    public function tell(string $agentKey, User $u, string $subject, string $body, ?string $url = null, bool $bell = true): bool
    {
        $a = self::agent($agentKey);
        if (! $a || $u->status !== 'active') {
            return false;
        }
        $cap = (int) Setting::get('agents.max_messages_per_person_per_day', 4);
        $countKey = 'agent-count:'.$u->id.':'.today()->toDateString();
        Cache::add($countKey, 0, 86400);
        if (Cache::increment($countKey) > $cap) {
            return false;
        }
        $text = $body.($url ? "\n\nOpen: ".url($url) : '');
        self::channel($a, $u)->messages()->create(['agent_key' => $a->key, 'body' => "**$subject**\n$text"]);
        if ($bell && ! self::inQuietHours($u)) {
            $u->notify(new \App\Notifications\Alert("$a->name ($a->role): $subject", mb_substr($body, 0, 200), '/app/chat'));
        }
        AiAction::forceCreate(['agent_key' => $a->key, 'kind' => 'message', 'subject_type' => 'User', 'subject_id' => $u->id, 'input_summary' => $subject, 'output' => $text, 'status' => 'done']);
        $a->forceFill(['last_active_at' => now(), 'last_action' => mb_substr("Messaged {$u->name}: $subject", 0, 180)])->saveQuietly();

        return true;
    }

    /** Post to a shared channel (e.g. General) as the agent. */
    public function announce(string $agentKey, string $body, string $channel = 'General'): void
    {
        if (! $a = self::agent($agentKey)) {
            return;
        }
        $c = ChatChannel::firstOrCreate(['kind' => 'general', 'name' => $channel]);
        $c->messages()->create(['agent_key' => $a->key, 'body' => $body]);
        $a->forceFill(['last_active_at' => now(), 'last_action' => mb_substr('Posted in #'.$channel, 0, 180)])->saveQuietly();
    }

    /**
     * Make a tracked request: a task assigned to the colleague, plus a chat/email. Follow-ups run automatically.
     * $key de-duplicates (the same request is not raised twice while open).
     */
    public function request(string $agentKey, User $u, string $title, string $body, \DateTimeInterface $due, string $key, ?string $url = null, ?string $unitId = null): ?Task
    {
        if (! self::agent($agentKey)) {
            return null;
        }
        $open = Task::where('agent_key', $agentKey)->where('assignee_id', $u->id)->where('status', '!=', 'done')->where('tags', 'like', '%"'.$key.'"%')->first();
        if ($open) {
            return $open;
        }
        $t = Task::create(['title' => $title, 'description' => $body, 'assignee_id' => $u->id, 'unit_id' => $unitId ?? $u->primary_unit_id, 'origin' => 'ai', 'agent_key' => $agentKey, 'priority' => 'high', 'due_at' => $due, 'tags' => [$key]]);
        $this->tell($agentKey, $u, $title, $body."\n\nPlease handle this by ".$t->due_at->timezone('Africa/Lagos')->format('D j M, H:i').' and mark the task done.', $url ?? "/app/tasks/$t->id/edit");

        return $t;
    }

    /** Escalation chain: unit manager → Ops Manager → Admin. */
    public static function managerOf(User $u): ?User
    {
        $q = fn (string $role) => User::where('status', 'active')->where('id', '!=', $u->id)->whereHas('role', fn ($r) => $r->where('key', $role));

        return $q('unit_manager')->where('primary_unit_id', $u->primary_unit_id)->first() ?? $q('ops_manager')->first() ?? $q('admin')->first() ?? $q('super_admin')->first();
    }

    /** Remind overdue agent requests twice (24 h apart), then escalate to the person's manager. */
    public function followUps(): int
    {
        $n = 0;
        Task::whereNotNull('agent_key')->where('status', '!=', 'done')->whereNull('escalated_at')->where('due_at', '<', now())
            ->where(fn ($q) => $q->whereNull('last_reminded_at')->orWhere('last_reminded_at', '<', now()->subDay()))->with('assignee')->each(function (Task $t) use (&$n) {
                $u = $t->assignee;
                if (! $u) {
                    return;
                }
                if ($t->reminder_count < 2) {
                    $this->tell($t->agent_key, $u, 'Reminder: '.$t->title, 'This is still open and was due '.$t->due_at->diffForHumans().'. If something is blocking you, reply and tell me.', "/app/tasks/$t->id/edit");
                    $t->forceFill(['reminder_count' => $t->reminder_count + 1, 'last_reminded_at' => now()])->save();
                } elseif ($m = self::managerOf($u)) {
                    $this->tell($t->agent_key, $m, "Escalation: {$u->name} — {$t->title}", "{$u->name} has not completed this after two reminders (due ".$t->due_at->format('j M').'). Please follow up.', "/app/tasks/$t->id/edit");
                    $t->forceFill(['escalated_at' => now()])->save();
                    $key = (string) ($t->tags[0] ?? '');
                    $tag = collect(['receipt-' => 'missingreceipt', 'absence-' => 'noexplanation', 'deal-' => 'stalleddeal'])->first(fn ($v, $prefix) => str_starts_with($key, $prefix)) ?? 'overdue';
                    app(Whiteboard::class)->post($t->agent_key, $u, [$tag], "did not complete \"{$t->title}\" after two reminders (due ".$t->due_at->format('j M').').', 'Task', $t->id, "escalated:$t->id");
                }
                $n++;
            });

        return $n;
    }
}
