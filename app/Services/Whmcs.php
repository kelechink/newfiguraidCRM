<?php

namespace App\Services;

use App\Models\BusinessUnit;
use App\Models\Contact;
use App\Models\Invoice;
use App\Models\Subscription;
use App\Models\Ticket;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/** FigureWeb WHMCS sync (read-only): clients, services, domains, invoices, tickets. Uses the WHMCS API credentials in .env. */
class Whmcs
{
    public static function configured(): bool
    {
        return (bool) (config('services.whmcs.url') && config('services.whmcs.identifier'));
    }

    public function call(string $action, array $params = []): array
    {
        $r = Http::asForm()->timeout(60)->post(rtrim(config('services.whmcs.url'), '/').'/includes/api.php', [
            'action' => $action, 'identifier' => config('services.whmcs.identifier'), 'secret' => config('services.whmcs.secret'), 'responsetype' => 'json',
        ] + (config('services.whmcs.access_key') ? ['accesskey' => config('services.whmcs.access_key')] : []) + $params);
        if (! $r->successful() || $r->json('result') !== 'success') {
            throw new RuntimeException("WHMCS $action failed: ".$r->json('message', 'HTTP '.$r->status()));
        }

        return $r->json();
    }

    public function sync(): array
    {
        $unit = BusinessUnit::where('code', 'FIGUREWEB')->firstOrFail();
        $counts = ['clients' => 0, 'services' => 0, 'domains' => 0, 'invoices' => 0, 'tickets' => 0];
        $start = 0;
        do {
            $res = $this->call('GetClients', ['limitstart' => $start, 'limitnum' => 250]);
            foreach ($res['clients']['client'] ?? [] as $c) {
                $email = strtolower(trim($c['email']));
                $contact = Contact::where('whmcs_client_id', $c['id'])->orWhere('email_normalized', $email)->first() ?? new Contact(['primary_unit_id' => $unit->id, 'source_channel' => 'import', 'source_detail' => 'WHMCS']);
                $contact->fill(['first_name' => $c['firstname'], 'last_name' => $c['lastname'], 'display_name' => trim("{$c['firstname']} {$c['lastname']}") ?: $c['companyname'], 'email' => $email, 'email_normalized' => $email, 'whmcs_client_id' => $c['id'], 'lifecycle' => 'customer'])->save();
                $contact->units()->syncWithoutDetaching([$unit->id]);
                $counts['clients']++;
            }
            $start += 250;
        } while ($start < (int) ($res['totalresults'] ?? 0));

        $cycle = fn ($c) => match (strtolower($c)) { 'monthly' => 'monthly', 'quarterly' => 'quarterly', 'biennially' => 'biennially', default => 'annually' };
        foreach ($this->call('GetClientsProducts', ['limitnum' => 1000])['products']['product'] ?? [] as $p) {
            $contact = Contact::where('whmcs_client_id', $p['clientid'])->first();
            Subscription::updateOrCreate(['external_ref' => 'svc-'.$p['id']], ['side' => 'customer', 'unit_id' => $unit->id, 'contact_id' => $contact?->id, 'name' => $p['name'].($p['domain'] ? " ({$p['domain']})" : ''), 'kind' => 'hosting',
                'amount' => (float) $p['recurringamount'], 'currency' => 'NGN', 'cycle' => $cycle($p['billingcycle']), 'next_due_on' => $p['nextduedate'] ?: today(), 'status' => strtolower($p['status']) === 'active' ? 'active' : (strtolower($p['status']) === 'pending' ? 'pending' : 'cancelled')]);
            $counts['services']++;
        }
        foreach ($this->call('GetClientsDomains', ['limitnum' => 1000])['domains']['domain'] ?? [] as $d) {
            $contact = Contact::where('whmcs_client_id', $d['userid'])->first();
            Subscription::updateOrCreate(['external_ref' => 'dom-'.$d['id']], ['side' => 'customer', 'unit_id' => $unit->id, 'contact_id' => $contact?->id, 'name' => $d['domainname'], 'kind' => 'domain',
                'amount' => (float) $d['recurringamount'], 'currency' => 'NGN', 'cycle' => 'annually', 'next_due_on' => $d['nextduedate'] ?: today(), 'status' => strtolower($d['status']) === 'active' ? 'active' : 'expired']);
            $counts['domains']++;
        }
        foreach ($this->call('GetInvoices', ['limitnum' => 500, 'orderby' => 'date', 'order' => 'desc'])['invoices']['invoice'] ?? [] as $i) {
            $contact = Contact::where('whmcs_client_id', $i['userid'])->first();
            $status = ['Paid' => 'paid', 'Unpaid' => 'sent', 'Overdue' => 'overdue', 'Cancelled' => 'void', 'Refunded' => 'void'][$i['status']] ?? 'sent';
            Invoice::firstOrNew(['external_ref' => 'whmcs-'.$i['id']])->forceFill(['unit_id' => $unit->id, 'number' => 'WHMCS-'.$i['id'], 'contact_id' => $contact?->id, 'currency' => $i['currencycode'] ?? 'NGN',
                'issue_date' => $i['date'], 'due_date' => $i['duedate'], 'subtotal' => $i['subtotal'], 'vat' => (float) $i['tax'] + (float) $i['tax2'], 'total' => $i['total'], 'amount_paid' => $status === 'paid' ? $i['total'] : 0, 'status' => $status])->save();
            $counts['invoices']++;
        }
        foreach ($this->call('GetTickets', ['limitnum' => 200])['tickets']['ticket'] ?? [] as $t) {
            $contact = Contact::where('whmcs_client_id', $t['userid'])->first();
            Ticket::updateOrCreate(['external_ref' => 'whmcs-'.$t['id']], ['unit_id' => $unit->id, 'number' => 'W-'.$t['tid'], 'contact_id' => $contact?->id, 'subject' => $t['subject'], 'status' => in_array($t['status'], ['Closed', 'Resolved']) ? 'resolved' : 'open', 'priority' => strtolower($t['priority'] ?? 'normal') === 'high' ? 'high' : 'normal']);
            $counts['tickets']++;
        }

        return $counts;
    }
}
