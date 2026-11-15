<?php

namespace App\Services;

use App\Domain\Telecom;
use App\Models\AttendanceDay;
use App\Models\BankTransaction;
use App\Models\Carrier;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Document;
use App\Models\Expense;
use App\Models\FraudAlert;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Playbook;
use App\Models\Subscription;
use App\Models\Task;
use App\Models\TrafficEntry;
use App\Models\UptimeCheck;
use App\Models\User;
use App\Notifications\Alert;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

/** Scheduled jobs (one cPanel cron: `php artisan schedule:run` every minute). */
class Ops
{
    public static function notifyRoles(array $roles, string $title, string $body, ?string $url = null, bool $email = false): void
    {
        User::where('status', 'active')->whereHas('role', fn ($r) => $r->whereIn('key', $roles))->get()->each->notify(new Alert($title, $body, $url, $email));
    }

    /** Create today's tasks from active playbooks (daily / weekly weekdays / monthly day). */
    public function generatePlaybookTasks(?CarbonImmutable $on = null): int
    {
        $d = $on ?? CarbonImmutable::now('Africa/Lagos');
        $n = 0;
        Playbook::where('is_active', true)->with('assignees')->each(function (Playbook $p) use ($d, &$n) {
            $due = match ($p->frequency) {
                'daily' => $d->isWeekday(),
                'weekly' => in_array($d->isoWeekday(), $p->weekdays ?? [1], true),
                'monthly' => $d->day === (int) ($p->day_of_month ?: 1),
                default => false,
            };
            if (! $due || ($p->starts_on && $d->lt($p->starts_on))) {
                return;
            }
            foreach ($p->assignees as $u) {
                $t = Task::firstOrCreate(['playbook_id' => $p->id, 'playbook_occurrence' => $d->toDateString(), 'assignee_id' => $u->id], [
                    'title' => $p->title, 'unit_id' => $p->unit_id, 'origin' => 'sop', 'priority' => $p->default_priority, 'description' => $p->body,
                    'checklist' => collect($p->steps ?? [])->map(fn ($s) => ['title' => is_array($s) ? ($s['title'] ?? '') : $s, 'done' => false])->all(),
                    'due_at' => CarbonImmutable::parse($d->toDateString().' '.$p->due_time, 'Africa/Lagos'),
                ]);
                $n += $t->wasRecentlyCreated ? 1 : 0;
            }
            $p->forceFill(['last_generated_on' => $d->toDateString()])->saveQuietly();
        });

        return $n;
    }

    /** Close yesterday: recompute everyone's day so absences / no-shows are fixed. */
    public function closeAttendance(): int
    {
        $y = CarbonImmutable::now('Africa/Lagos')->subDay()->toDateString();
        $svc = app(AttendanceService::class);
        $n = 0;
        User::where('status', 'active')->whereHas('staffProfile')->each(function ($u) use ($svc, $y, &$n) {
            $svc->recompute($u, $y);
            $n++;
        });

        return $n;
    }

    /** Fraud scan: spikes (>3× 7-day average), new destinations, ASR drops below 50% of average, credit exposure. */
    public function fraudScan(): int
    {
        $n = 0;
        $today = today();
        Carrier::whereIn('role', ['customer', 'both'])->where('status', 'active')->each(function ($c) use ($today, &$n) {
            $todayMin = (float) TrafficEntry::where('customer_carrier_id', $c->id)->whereDate('date', $today->copy()->subDay())->sum('minutes');
            $avg = (float) TrafficEntry::where('customer_carrier_id', $c->id)->whereBetween('date', [$today->copy()->subDays(8), $today->copy()->subDays(2)])->sum('minutes') / 7;
            $raise = function ($kind, $sev, $summary, $data = []) use ($c, &$n) {
                if (! FraudAlert::where('carrier_id', $c->id)->where('kind', $kind)->where('status', 'open')->whereDate('created_at', today())->exists()) {
                    FraudAlert::create(['carrier_id' => $c->id, 'kind' => $kind, 'severity' => $sev, 'summary' => $summary, 'data' => $data]);
                    $n++;
                }
            };
            if ($avg > 100 && $todayMin > 3 * $avg) {
                $raise('spike', 'critical', "{$c->name}: ".number_format($todayMin).' min yesterday vs '.number_format($avg).' daily average', compact('todayMin', 'avg'));
            }
            $known = TrafficEntry::where('customer_carrier_id', $c->id)->whereDate('date', '<', $today->copy()->subDay())->distinct()->pluck('destination');
            $new = TrafficEntry::where('customer_carrier_id', $c->id)->whereDate('date', $today->copy()->subDay())->whereNotIn('destination', $known)->where('minutes', '>', 500)->pluck('destination');
            if ($known->isNotEmpty() && $new->isNotEmpty()) {
                $raise('unusual_destination', 'warning', "{$c->name}: new destinations ".$new->implode(', '));
            }
            $y = TrafficEntry::where('customer_carrier_id', $c->id)->whereDate('date', $today->copy()->subDay())->selectRaw('sum(attempts) a, sum(connected) k')->first();
            $w = TrafficEntry::where('customer_carrier_id', $c->id)->whereBetween('date', [$today->copy()->subDays(8), $today->copy()->subDays(2)])->selectRaw('sum(attempts) a, sum(connected) k')->first();
            if ($y->a > 200 && $w->a > 0) {
                $asrY = $y->k / $y->a;
                $asrW = $w->k / $w->a;
                if ($asrW > 0 && $asrY < $asrW * 0.5) {
                    $raise('asr_drop', 'warning', "{$c->name}: ASR fell to ".round($asrY * 100).'% from '.round($asrW * 100).'%');
                }
            }
            $exposure = (float) Invoice::where('carrier_id', $c->id)->whereIn('status', ['sent', 'part_paid', 'overdue'])->selectRaw('sum(total - amount_paid) o')->value('o');
            if (Telecom::creditState($exposure, (float) $c->credit_limit) === 'over') {
                $raise('credit', 'critical', "{$c->name} is over its credit limit ({$c->currency} ".number_format($exposure, 2).')');
            }
        });
        if ($n) {
            self::notifyRoles(['super_admin', 'admin', 'telecom_ops', 'finance'], 'Fraud / traffic alerts', "$n new alert(s) on telecom traffic.", '/app/fraud-alerts', true);
        }

        return $n;
    }

    /** Overdue status + dunning reminders at 1, 7, 14, 30 days overdue. */
    public function dunning(): int
    {
        $n = 0;
        Invoice::where('kind', 'invoice')->whereIn('status', ['sent', 'part_paid'])->whereDate('due_date', '<', today())->update(['status' => 'overdue']);
        Invoice::where('status', 'overdue')->with(['contact', 'carrier'])->each(function ($i) use (&$n) {
            $days = $i->due_date->diffInDays(today());
            $level = $days >= 30 ? 4 : ($days >= 14 ? 3 : ($days >= 7 ? 2 : 1));
            if ($level > $i->dunning_level) {
                $i->forceFill(['dunning_level' => $level])->save();
                $n++;
            }
        });
        if ($n) {
            self::notifyRoles(['finance'], 'Overdue invoices', "$n invoice(s) moved up a dunning level today.", '/app/invoices');
        }

        return $n;
    }

    public function uptime(): int
    {
        $down = 0;
        foreach (UptimeCheck::all() as $c) {
            $t = microtime(true);
            try {
                $r = Http::timeout(15)->withoutRedirecting()->get($c->url);
                $status = $r->status();
            } catch (\Throwable) {
                $status = 0;
            }
            $up = $status >= 200 && $status < 400;
            if (! $up && $c->is_up !== false) {
                self::notifyRoles(['super_admin', 'admin', 'ops_manager'], "$c->name is down", "$c->url returned ".($status ?: 'no response'), '/app/uptime-checks', true);
            }
            $c->forceFill(['is_up' => $up, 'last_status' => $status, 'last_ms' => (int) ((microtime(true) - $t) * 1000), 'last_checked_at' => now(), 'down_since' => $up ? null : ($c->down_since ?? now())])->save();
            $down += $up ? 0 : 1;
        }

        return $down;
    }

    /** Contracts, licences, domains, certificates and our own subscriptions coming due. */
    public function renewals(): int
    {
        $n = 0;
        $dsr = \App\Models\DataRequest::where('status', 'verified')->where('due_on', '<=', today()->addDays(5))->count();
        if ($dsr) {
            self::notifyRoles(['super_admin', 'admin'], 'Data-rights requests due', "$dsr request(s) must be answered within 5 days (NDPA 30-day limit).", '/app/data-requests', true);
            $n += $dsr;
        }
        Document::whereNotNull('expires_on')->get()->filter(fn ($d) => in_array($d->expires_on->diffInDays(today(), true), [$d->remind_days_before, 14, 7, 1]) && $d->expires_on->isFuture())->each(function ($d) use (&$n) {
            ($d->owner ?? null)?->notify(new Alert('Renewal due', "$d->title expires on ".$d->expires_on->format('j M Y'), "/app/documents/$d->id/edit", true));
            self::notifyRoles(['admin'], 'Renewal due', "$d->title expires on ".$d->expires_on->format('j M Y'));
            $n++;
        });
        Subscription::where('side', 'own')->whereIn('status', ['active', 'pending'])->whereDate('next_due_on', '<=', today()->addDays(7))->each(function ($s) use (&$n) {
            self::notifyRoles(['finance'], 'Subscription due', "$s->name ($s->currency ".number_format($s->amount, 2).') due '.$s->next_due_on->format('j M'));
            $n++;
        });

        return $n;
    }

    /** Facts for the command dashboard & Kene's brief (no margins/buy rates leave this method to AI). */
    public static function briefFacts(): array
    {
        return [
            'New leads yesterday' => Contact::where('lifecycle', 'lead')->whereDate('created_at', today()->subDay())->count(),
            'Open deals' => Deal::where('status', 'open')->count(),
            'Deals won this month' => Deal::where('status', 'won')->where('won_at', '>=', now()->startOfMonth())->count(),
            'Unanswered conversations' => Conversation::where('status', 'open')->whereNull('first_response_at')->count(),
            'Overdue tasks' => Task::where('status', '!=', 'done')->where('due_at', '<', now())->count(),
            'Invoices overdue' => Invoice::where('status', 'overdue')->count(),
            'Renewals in 7 days' => Subscription::where('side', 'customer')->whereBetween('next_due_on', [today(), today()->addDays(7)])->count(),
            'Late arrivals yesterday' => AttendanceDay::whereDate('date', today()->subDay())->where('status', 'late')->count(),
        ];
    }

    /** Daily reconciliation report: gateway payments vs bank vs invoices. */
    public function reconciliationReport(): array
    {
        $y = today()->subDay();
        $r = [
            'date' => $y->toDateString(),
            'paystack' => (float) Payment::where('gateway', 'paystack')->whereDate('paid_at', $y)->sum('amount_ngn'),
            'flutterwave' => (float) Payment::where('gateway', 'flutterwave')->whereDate('paid_at', $y)->sum('amount_ngn'),
            'bank_matched' => (float) Payment::where('gateway', 'bank')->whereDate('paid_at', $y)->sum('amount_ngn'),
            'bank_unmatched_credits' => BankTransaction::where('amount', '>', 0)->whereIn('match_status', ['unmatched', 'suggested'])->count(),
            'expenses' => (float) Expense::whereIn('status', ['approved', 'paid'])->whereDate('date', $y)->sum('amount_ngn'),
        ];
        $to = User::where('status', 'active')->whereHas('role', fn ($q) => $q->whereIn('key', ['finance', 'super_admin']))->pluck('email');
        if ($to->isNotEmpty()) {
            try {
                Mail::raw("Daily reconciliation for {$r['date']}\n\n".collect($r)->except('date')->map(fn ($v, $k) => str_pad(str_replace('_', ' ', $k), 26).(is_float($v) ? '₦'.number_format($v, 2) : $v))->implode("\n"), fn ($m) => $m->to($to->all())->subject("Daily reconciliation — {$r['date']}"));
            } catch (\Throwable) {
            }
        }

        return $r;
    }
}
