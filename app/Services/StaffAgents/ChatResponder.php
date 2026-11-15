<?php

namespace App\Services\StaffAgents;

use App\Models\AiAction;
use App\Models\AiAgent;
use App\Models\ChatChannel;
use App\Models\Task;
use App\Models\User;
use App\Notifications\Alert;
use App\Services\AgentMessenger;
use App\Services\AiGateway;
use App\Services\Agents;

/**
 * When a colleague answers a staff agent in Team chat, the agent replies like a colleague would.
 * The AI sees only: the agent's role, the person's first name, the titles of open requests, the last few chat
 * lines and internal (non-confidential) knowledge base articles. Never salaries, bank details or money figures.
 * "done"/"finished" closes the agent's open request; anything it can't handle goes to the human owner (HR,
 * Finance or Ops) as a notification.
 */
class ChatResponder
{
    public const HANDOFF_ROLE = ['hr' => 'hr', 'accountant' => 'finance', 'gm' => 'ops_manager'];

    public function respond(ChatChannel $c, User $from, string $text): void
    {
        $a = AgentMessenger::agent((string) $c->agent_key);
        if (! $a) {
            return;
        }
        $open = Task::where('agent_key', $a->key)->where('assignee_id', $from->id)->where('status', '!=', 'done')->orderBy('due_at')->get();
        if (preg_match('/\b(done|finished|completed|sorted|submitted|uploaded)\b/i', $text) && $open->count() === 1) {
            $open->first()->forceFill(['status' => 'done'])->save();
            $c->messages()->create(['agent_key' => $a->key, 'body' => 'Thank you, '.strtok($from->name, ' ').' — I\'ve marked "'.$open->first()->title.'" as done.']);

            return;
        }
        $history = $c->messages()->latest()->limit(8)->get()->reverse()->map(fn ($m) => ($m->agent_key ? $a->name : strtok($from->name, ' ')).': '.mb_substr((string) $m->body, 0, 400))->implode("\n");
        $kb = \App\Models\KbArticle::where('status', 'published')->whereIn('audience', ['public', 'internal'])->get()
            ->sortByDesc(fn ($k) => collect(preg_split('/\W+/', strtolower($text)))->filter(fn ($w) => strlen($w) > 3)->sum(fn ($w) => substr_count(strtolower($k->title.' '.$k->body), $w)))->take(2)
            ->map(fn ($k) => "## $k->title\n".mb_substr(strip_tags($k->body), 0, 1200))->implode("\n\n");
        $system = "You are {$a->name}, the {$a->role} at Figuraid, an AI colleague. {$a->brief}\n"
            ."Company rules you can state: work hours Mon–Fri 09:00–17:00 at Kano House, late after 09:00 is ₦500, leaving before 17:00 is ₦500, unexcused absence ₦3,000, missed clock-out counts as absence, off-site punches need manager approval.\n"
            ."Never state anyone's salary, bank details, payroll amounts, balances or prices. You cannot approve leave, expenses, payroll or payments — say who will. If unsure, say you'll pass it to the human team. Reply in under 80 words. End with HANDOFF: yes if a person must act, else HANDOFF: no.\n"
            ."Open requests you made to this person: ".($open->pluck('title')->implode('; ') ?: 'none')."\nInternal knowledge:\n".($kb ?: 'none');
        try {
            $r = app(AiGateway::class)->complete($system, "Chat so far:\n$history\n\n".AiGateway::fence($text));
            $reply = trim(preg_replace('/HANDOFF:\s*(yes|no)/i', '', $r['text']));
            $handoff = (bool) preg_match('/HANDOFF:\s*yes/i', $r['text']);
        } catch (\Throwable) {
            [$reply, $handoff] = ['Thanks — I\'ve passed this to the team and someone will get back to you shortly.', true];
        }
        $c->messages()->create(['agent_key' => $a->key, 'body' => $reply]);
        AiAction::forceCreate(['agent_key' => $a->key, 'kind' => 'reply', 'subject_type' => 'User', 'subject_id' => $from->id, 'input_summary' => mb_substr($text, 0, 500), 'output' => $reply, 'status' => 'done']);
        if ($handoff) {
            User::where('status', 'active')->whereHas('role', fn ($q) => $q->where('key', self::HANDOFF_ROLE[$a->key] ?? 'ops_manager'))->get()
                ->each->notify(new Alert("{$a->name}: {$from->name} needs a person", mb_substr($text, 0, 200), '/app/chat'));
        }
    }
}
