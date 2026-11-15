<?php

namespace App\Services;

use App\Filament\Widgets\Metrics;
use App\Models\AttendanceDay;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\Expense;
use App\Models\Payment;
use App\Models\ScheduledReport;
use Illuminate\Support\Facades\Mail;

/** Scheduled email reports (daily / weekly / monthly) built from plain-code numbers. */
class ReportService
{
    public const REPORTS = ['revenue' => 'Revenue & expenses', 'pipeline' => 'Pipeline & leads', 'attendance' => 'Attendance', 'inbox' => 'Inbox health', 'reconciliation' => 'Payments reconciliation'];

    public static function build(string $report, \DateTimeInterface $from): array
    {
        return match ($report) {
            'revenue' => ['Income' => Metrics::ngn((float) Payment::where('status', 'confirmed')->where('paid_at', '>=', $from)->sum('amount_ngn')), 'Expenses' => Metrics::ngn((float) Expense::whereIn('status', ['approved', 'paid'])->where('date', '>=', $from)->sum('amount_ngn'))],
            'pipeline' => ['New leads' => Contact::where('created_at', '>=', $from)->count(), 'Deals won' => Deal::where('won_at', '>=', $from)->count(), 'Deals lost' => Deal::where('lost_at', '>=', $from)->count(), 'Open deals' => Deal::where('status', 'open')->count()],
            'attendance' => AttendanceDay::where('date', '>=', $from)->selectRaw('status, count(*) n')->groupBy('status')->pluck('n', 'status')->all(),
            'inbox' => ['Conversations' => Conversation::where('created_at', '>=', $from)->count(), 'Resolved' => Conversation::where('resolved_at', '>=', $from)->count(), 'Escalated' => Conversation::where('created_at', '>=', $from)->where('escalation_level', '>', 0)->count()],
            'reconciliation' => collect(['paystack', 'flutterwave', 'bank'])->mapWithKeys(fn ($g) => [ucfirst($g) => Metrics::ngn((float) Payment::where('gateway', $g)->where('paid_at', '>=', $from)->sum('amount_ngn'))])->all(),
            default => [],
        };
    }

    public function sendDue(): int
    {
        $n = 0;
        foreach (ScheduledReport::all() as $r) {
            $period = ['daily' => now()->subDay(), 'weekly' => now()->subWeek(), 'monthly' => now()->subMonth()][$r->frequency] ?? now()->subDay();
            $due = ! $r->last_sent_at || $r->last_sent_at->lte($period->copy()->addMinutes(5))
                && ($r->frequency !== 'weekly' || now()->isMonday()) && ($r->frequency !== 'monthly' || now()->day === 1);
            if (! $due || ! $r->recipients) {
                continue;
            }
            $lines = collect(self::build($r->report, $period))->map(fn ($v, $k) => str_pad((string) $k, 22).$v)->implode("\n");
            Mail::raw(($r->name)."\nPeriod: since ".$period->format('j M Y')."\n\n$lines\n\n— Figuraid OS", fn ($m) => $m->to($r->recipients)->subject("$r->name — ".now()->format('j M Y')));
            $r->forceFill(['last_sent_at' => now()])->save();
            $n++;
        }

        return $n;
    }
}
