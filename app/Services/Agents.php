<?php

namespace App\Services;

use App\Domain\Money;
use App\Models\AiAction;
use App\Models\AiAgent;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\KbArticle;
use App\Models\Message;
use App\Models\Subscription;
use App\Models\Task;
use App\Models\User;
use App\Notifications\Alert;

/**
 * The AI team. Data rule (PRD v3 §8): prompts carry only public business information from the public
 * knowledge base. Agents never see or send buy rates, margins, vendor names, salaries, bank details or staff
 * records, and never take payment, discount or refund actions — those always become approval requests.
 */
class Agents
{
    public const TEAM = [
        ['front_desk', 'Ada', 'Front Desk', '#4cc9ff', 'You are Ada, the front desk for Figuraid (wholesale telecom), FigureWeb (hosting & web) and Figure Academy (tech training). Greet, answer from the knowledge base only, collect name, company, email and what they need, and hand over to a human for anything about prices, contracts, refunds or discounts. Be brief, warm and precise. Never invent facts, figures, coverage or prices.', ['quote', 'discount', 'refund', 'contract']],
        ['analyst', 'Kene', 'Business Analyst & Sales', '#a78bfa', 'You are Kene. You write the morning brief from the numbers you are given, and suggest the three most valuable follow-ups. Plain English, no hype.', ['quote']],
        ['support', 'Femi', 'Technical Support', '#34d399', 'You are Femi, technical support for FigureWeb hosting, domains and email. Troubleshoot step by step from the knowledge base; open a ticket when it needs an engineer.', ['account_change']],
        ['vendor', 'Dayo', 'Vendor & Supplier Manager', '#f59e0b', 'You are Dayo. You chase suppliers for quotes and delivery updates and summarise what changed. Purchase orders always need approval.', ['purchase_order', 'broadcast']],
        ['social', 'Zara', 'Social Media', '#f472b6', 'You are Zara. You draft social posts in the brand voice: confident, plain, specific, no unverified claims. Every post waits for approval.', ['publish_post']],
        ['care', 'Nneka', 'Customer Care', '#fb7185', 'You are Nneka. You write birthday wishes, renewal reminders, win-back notes and satisfaction surveys. Win-back discounts need approval.', ['winback_discount']],
        ['email', 'Seyi', 'Email Marketing', '#60a5fa', 'You are Seyi. You draft email campaigns for Brevo. Campaign launch needs approval.', ['campaign_launch']],
    ];

    public function __construct(private AiGateway $ai) {}

    public static function agent(string $key): AiAgent
    {
        return AiAgent::where('key', $key)->firstOrFail();
    }

    private function log(string $agent, string $kind, ?object $subject, string $input, string $output, string $status = 'done', ?string $provider = null): AiAction
    {
        AiAgent::where('key', $agent)->update(['last_active_at' => now(), 'last_action' => mb_substr("$kind: ".strtok($output, "\n"), 0, 180)]);

        return AiAction::create(['agent_key' => $agent, 'kind' => $kind, 'subject_type' => $subject ? class_basename($subject) : null, 'subject_id' => $subject?->getKey(), 'input_summary' => mb_substr($input, 0, 1000), 'output' => $output, 'status' => $status, 'provider' => $provider]);
    }

    /** Relevant public knowledge-base snippets for a question (simple keyword scoring; no internal articles). */
    public static function knowledge(string $q, ?string $unitId = null, int $limit = 4): string
    {
        $words = collect(preg_split('/\W+/', strtolower($q)))->filter(fn ($w) => strlen($w) > 3)->unique()->take(8);
        $arts = KbArticle::where('audience', 'public')->where('status', 'published')->when($unitId, fn ($x) => $x->where(fn ($y) => $y->whereNull('unit_id')->orWhere('unit_id', $unitId)))->get();
        $scored = $arts->map(fn ($a) => [$a, $words->sum(fn ($w) => substr_count(strtolower($a->title.' '.$a->body), $w))])->filter(fn ($x) => $x[1] > 0)->sortByDesc(1)->take($limit);

        return $scored->map(fn ($x) => "## {$x[0]->title}\n".mb_substr(strip_tags($x[0]->body), 0, 1500))->implode("\n\n") ?: 'No matching article.';
    }

    /** Website assistant reply. Returns [reply, needsHuman]. */
    public function websiteReply(string $history, string $message): array
    {
        $a = self::agent('front_desk');
        $kb = self::knowledge($message);
        $system = $a->brief."\n\nKnowledge base (public):\n$kb\n\nIf you cannot answer from the knowledge base, say a specialist will reply by email and ask for their email. Reply in under 90 words. End with the line HANDOFF: yes or HANDOFF: no.";
        try {
            $r = $this->ai->complete($system, "Conversation so far:\n".mb_substr($history, -3000)."\n\n".AiGateway::fence($message));
            $text = $r['text'];
            $handoff = (bool) preg_match('/HANDOFF:\s*yes/i', $text);
            $text = trim(preg_replace('/HANDOFF:\s*(yes|no)/i', '', $text));
            $this->log('front_desk', 'reply', null, Money::maskPii($message), $text, 'done', $r['provider']);

            return [$text, $handoff];
        } catch (\Throwable) {
            return ['Thanks — a member of our team will reply shortly. What is the best email to reach you?', true];
        }
    }

    /** Classify an inbound conversation and draft a reply for staff (sent automatically only for KB answers in webchat). */
    public function triage(Conversation $c): void
    {
        $last = $c->messages()->where('direction', 'in')->latest()->first();
        if (! $last) {
            return;
        }
        $system = 'Classify this customer message for Figuraid. Reply ONLY JSON: {"category":"sales|support|billing|complaint|spam|other","priority":"low|normal|high|urgent","summary":"one line","draft":"a short helpful reply using only the knowledge base, or empty if a human must answer","task":"a follow-up task title or empty"}'."\n\nKnowledge base:\n".self::knowledge($last->body, $c->unit_id, 3);
        try {
            $r = $this->ai->complete($system, AiGateway::fence($last->body));
            $j = Money::extractJson($r['text']) ?? [];
        } catch (\Throwable) {
            return;
        }
        $c->forceFill(['category' => $j['category'] ?? null, 'priority' => in_array($j['priority'] ?? '', ['low', 'normal', 'high', 'urgent']) ? $j['priority'] : 'normal', 'agent_key' => 'front_desk'])->save();
        if (! empty($j['draft'])) {
            Message::create(['conversation_id' => $c->id, 'direction' => 'out', 'author_type' => 'agent', 'agent_key' => 'front_desk', 'body' => $j['draft'], 'delivery' => 'draft', 'needs_approval' => true]);
        }
        if (! empty($j['task'])) {
            Task::create(['title' => mb_substr($j['task'], 0, 250), 'unit_id' => $c->unit_id, 'origin' => 'ai', 'agent_key' => 'front_desk', 'assignee_id' => $c->assignee_id, 'conversation_id' => $c->id, 'contact_id' => $c->contact_id, 'due_at' => now()->addHours(4)]);
        }
        $this->log('front_desk', 'classify', $c, $j['summary'] ?? '', json_encode($j), 'done', $r['provider'] ?? null);
    }

    /** Kene's morning brief — computed in code; AI only phrases non-sensitive counts. */
    public function morningBrief(array $facts): string
    {
        $plain = collect($facts)->map(fn ($v, $k) => "- $k: $v")->implode("\n");
        try {
            $r = $this->ai->complete(self::agent('analyst')->brief, "Today's numbers:\n$plain\n\nWrite a 6-line morning brief and 3 suggested actions.");
            $text = $r['text'];
        } catch (\Throwable) {
            $text = "Morning brief\n$plain";
        }
        $this->log('analyst', 'brief', null, $plain, $text);

        return $text;
    }

    /** Nneka: renewals at 30/14/7/1 days, birthdays today, win-back for churned. Emails are drafted, discounts need approval. */
    public function customerCare(): array
    {
        $n = ['renewals' => 0, 'birthdays' => 0];
        foreach ([30, 14, 7, 1] as $days) {
            Subscription::where('side', 'customer')->where('status', 'active')->whereDate('next_due_on', today()->addDays($days))->with('contact')->each(function ($s) use ($days, &$n) {
                $sent = $s->reminders_sent ?? [];
                $key = $s->next_due_on->toDateString().":$days";
                if (in_array($key, $sent) || ! $s->contact?->email) {
                    return;
                }
                $this->log('care', 'renewal', $s, "{$s->name} due in $days days", "Hi {$s->contact->first_name}, a reminder that {$s->name} renews on {$s->next_due_on->format('j M Y')}. Reply if you need any help.");
                $s->forceFill(['reminders_sent' => [...$sent, $key]])->save();
                $n['renewals']++;
            });
        }
        Contact::whereMonth('birthday', today()->month)->whereDay('birthday', today()->day)->each(function ($c) use (&$n) {
            $this->log('care', 'birthday', $c, $c->display_name, "Happy birthday, {$c->first_name}! Everyone at Figuraid wishes you a wonderful year.");
            $n['birthdays']++;
        });
        User::where('status', 'active')->whereMonth('birthday', today()->month)->whereDay('birthday', today()->day)->each(fn ($u) => User::whereHas('role', fn ($r) => $r->where('key', 'hr'))->get()->each->notify(new Alert('Staff birthday today', "It's {$u->name}'s birthday.")));

        return $n;
    }

    public function requestApproval(string $agent, string $kind, ?object $subject, string $summary, string $proposal): AiAction
    {
        $a = $this->log($agent, $kind, $subject, $summary, $proposal, 'pending_approval');
        User::whereHas('role', fn ($r) => $r->whereIn('key', ['super_admin', 'admin', 'ops_manager']))->get()->each->notify(new Alert('Approval needed', self::agent($agent)->name.": $summary", '/app/ai-actions'));

        return $a;
    }
}
