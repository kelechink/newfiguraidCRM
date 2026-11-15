<?php

namespace App\Services\StaffAgents;

use App\Domain\Money;
use App\Filament\Widgets\Metrics;
use App\Models\BankTransaction;
use App\Models\Expense;
use App\Models\FxRate;
use App\Models\Invoice;
use App\Models\PayrollRun;
use App\Models\Subscription;
use App\Models\TaxRecord;
use App\Models\User;
use App\Services\AgentMessenger;
use App\Services\FxService;

/**
 * Financial Accountant agent. All figures come from plain code and go straight into fixed message templates;
 * no money data is ever sent to an AI model. It requests, reminds and escalates — it never approves or pays.
 */
class AccountantAgent
{
    public const KEY = 'accountant';

    public function __construct(private AgentMessenger $m) {}

    private function people(array $roles)
    {
        return User::where('status', 'active')->whereHas('role', fn ($r) => $r->whereIn('key', $roles))->get();
    }

    private function ngn(float $v): string
    {
        return '₦'.number_format($v, 2);
    }

    public function daily(): int
    {
        $n = 0;
        $finance = $this->people(['finance']);
        $date = today()->toDateString();

        // Expense requests waiting more than 48 h → approvers
        $waiting = Expense::where('status', 'requested')->where('created_at', '<', now()->subHours(48))->get();
        if ($waiting->isNotEmpty() && AgentMessenger::once("acct:expenses:$date")) {
            $limit = (float) \App\Models\Setting::get('finance.approval_limit_ngn', 500000);
            $big = $waiting->where('amount_ngn', '>', $limit)->count();
            $to = $big ? $this->people(['finance', 'admin']) : $finance;
            foreach ($to as $u) {
                $n += (int) $this->m->tell(self::KEY, $u, $waiting->count().' expense request(s) waiting over 48 hours', 'Total '.$this->ngn((float) $waiting->sum('amount_ngn')).($big ? ". $big of them are above the approval limit and need an Admin." : '.').' Please approve or reject them.', '/app/expenses');
            }
        }
        // Approved/paid expenses with no receipt → ask the requester
        foreach (Expense::whereIn('status', ['approved', 'paid'])->whereNull('receipt_file_id')->where('date', '>=', now()->subDays(60))->with('requestedBy')->get() as $e) {
            if ($e->requestedBy) {
                $n += (int) (bool) $this->m->request(self::KEY, $e->requestedBy, 'Upload the receipt for: '.$e->description, 'Every expense needs a receipt for the books and tax. Please attach it to the expense ('.$e->currency.' '.number_format((float) $e->amount, 2).', '.$e->date->format('j M').').', now()->addDays(3), "receipt-$e->id", "/app/expenses/$e->id/edit");
            }
        }
        // Bank lines waiting for review
        $review = BankTransaction::where('amount', '>', 0)->whereIn('match_status', ['suggested', 'unmatched'])->count();
        if ($review && AgentMessenger::once("acct:bank:$date")) {
            foreach ($finance as $u) {
                $n += (int) $this->m->tell(self::KEY, $u, "$review bank credit(s) need matching", 'Confirm the suggested matches or mark lines that are not invoice payments, so receivables stay accurate.', '/app/bank-transactions', false);
            }
        }
        // Our bills and subscriptions due within 7 days
        $due = Subscription::where('side', 'own')->whereIn('status', ['active', 'pending'])->whereBetween('next_due_on', [today(), today()->addDays(7)])->get();
        if ($due->isNotEmpty() && AgentMessenger::once("acct:bills:$date")) {
            $list = $due->map(fn ($s) => "• {$s->name}: {$s->currency} ".number_format((float) $s->amount, 2).' (≈'.$this->ngn((float) (FxService::toNgn((float) $s->amount, $s->currency) ?? 0)).') due '.$s->next_due_on->format('j M'))->implode("\n");
            foreach ($finance as $u) {
                $n += (int) $this->m->tell(self::KEY, $u, $due->count().' bill(s) due this week', $list, '/app/subscriptions');
            }
        }
        // FX rates that failed the two-source check
        if (FxRate::where('status', 'needs_review')->where('date', '>=', today()->subDays(2))->exists() && AgentMessenger::once("acct:fx:$date")) {
            foreach ($finance as $u) {
                $n += (int) $this->m->tell(self::KEY, $u, 'Today\'s exchange rate needs your check', 'The automatic rate research found sources that disagree. Please confirm or enter today\'s rate so naira totals stay right.', '/app/fx-rates', false);
            }
        }
        // Overdue receivables → tell the account owner (customer reminders themselves need a person)
        foreach (Invoice::where('status', 'overdue')->where('dunning_level', '>=', 2)->with(['contact.owner', 'carrier.accountManager'])->get() as $i) {
            $owner = $i->carrier?->accountManager ?? $i->contact?->owner;
            if ($owner) {
                $n += (int) (bool) $this->m->request(self::KEY, $owner, "Chase payment: $i->number", ($i->carrier?->name ?? $i->contact?->display_name).' owes '.$i->currency.' '.number_format($i->outstanding(), 2).', overdue since '.$i->due_date->format('j M').'. Please contact them and note the promised payment date on the invoice.', now()->addDays(2), "chase-$i->id", "/app/invoices/$i->id/edit");
            }
        }

        return $n;
    }

    /** Monthly close checklist on the 1st; statutory remittance reminders on the 10th and 18th. */
    public function monthEnd(): int
    {
        $n = 0;
        $last = now()->subMonth()->format('Y-m');
        $finance = $this->people(['finance']);
        if (now()->day === 1 && AgentMessenger::once("acct:close:$last", 3 * 86400)) {
            $missing = [];
            if (! PayrollRun::where('period_month', now()->format('Y-m'))->exists()) {
                $missing[] = 'Create this month\'s payroll run';
            }
            if (BankTransaction::whereIn('match_status', ['suggested', 'unmatched'])->exists()) {
                $missing[] = 'Clear the bank review queue';
            }
            if (Expense::whereIn('status', ['approved', 'paid'])->whereNull('receipt_file_id')->where('date', 'like', "$last%")->exists()) {
                $missing[] = 'Collect missing receipts for '.$last;
            }
            foreach ($finance as $u) {
                $n += (int) (bool) $this->m->request(self::KEY, $u, "Month-end close for $last", "Checklist:\n• Reconcile every bank account\n• Record VAT, WHT and PAYE for $last in Tax records\n• Review the profit by unit\n".($missing ? "\nStill open:\n• ".implode("\n• ", $missing) : ''), now()->addDays(5), "close-$last", '/app/finance-dashboard');
            }
        }
        if (in_array(now()->day, [10, 18], true) && AgentMessenger::once('acct:statutory:'.now()->format('Y-m-d'))) {
            $open = TaxRecord::where('status', 'open')->where('period_month', $last)->get();
            $body = "Statutory remittances for $last are due soon (check exact dates with your tax adviser): PAYE to FCT-IRS, pension to the PFAs, WHT and VAT to FIRS.".($open->isNotEmpty() ? "\nOpen records: ".$open->map(fn ($t) => strtoupper($t->kind).' '.$this->ngn((float) $t->amount))->implode(', ') : '');
            foreach ($finance as $u) {
                $n += (int) $this->m->tell(self::KEY, $u, 'Tax and pension remittances due', $body, '/app/tax-records');
            }
        }

        return $n;
    }

    /** Weekly cash note to Super Admin and Admin (figures by code, template wording). */
    public function weekly(): int
    {
        if (! AgentMessenger::once('acct:weekly:'.now()->format('o-W'), 6 * 86400)) {
            return 0;
        }
        $cash = Metrics::cash();
        $runway = Money::runwayMonths($cash, Metrics::monthly('income'), Metrics::monthly('expense'));
        $owed = Invoice::whereIn('status', ['sent', 'part_paid', 'overdue'])->get()->sum(fn ($i) => $i->outstanding() * ($i->currency === 'NGN' ? 1 : (float) $i->fx_rate));
        $body = "Cash position: ".$this->ngn($cash)."\nRunway: ".($runway === null ? 'not burning cash' : "$runway months")."\nOwed to us: ".$this->ngn($owed).' ('.Invoice::where('status', 'overdue')->count()." overdue)\nDebt outstanding: ".$this->ngn(Metrics::debtOutstanding());
        $n = 0;
        foreach ($this->people(['super_admin', 'admin']) as $u) {
            $n += (int) $this->m->tell(self::KEY, $u, 'Weekly cash note', $body, '/app/finance-dashboard');
        }

        return $n;
    }
}
