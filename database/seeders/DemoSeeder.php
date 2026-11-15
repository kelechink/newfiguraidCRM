<?php

namespace Database\Seeders;

use App\Models\Announcement;
use App\Models\AttendanceDay;
use App\Models\AttendancePunch;
use App\Models\BankAccount;
use App\Models\BusinessUnit;
use App\Models\Carrier;
use App\Models\ChatChannel;
use App\Models\Cohort;
use App\Models\Company;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Course;
use App\Models\Deal;
use App\Models\Debt;
use App\Models\Document;
use App\Models\Enrolment;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\FxRate;
use App\Models\Goal;
use App\Models\Invoice;
use App\Models\Message;
use App\Models\Office;
use App\Models\Payment;
use App\Models\Pipeline;
use App\Models\Playbook;
use App\Models\RateDeck;
use App\Models\Rfq;
use App\Models\Role;
use App\Models\Subscription;
use App\Models\Task;
use App\Models\TrafficEntry;
use App\Models\TrainingCourse;
use App\Models\User;
use App\Models\Vendor;
use App\Services\AttendanceService;
use App\Services\InvoiceService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/** Demo data so every screen can be shown. Never run in production. Password for all demo users: DEMO_PASSWORD in .env or "Figuraid-demo-2026". */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $u = fn ($c) => BusinessUnit::where('code', $c)->first();
        [$tel, $web, $aca, $pro] = [$u('TELECOM'), $u('FIGUREWEB'), $u('ACADEMY'), $u('PROCUREMENT')];
        $pw = env('DEMO_PASSWORD', 'Figuraid-demo-2026');
        $people = [
            ['Founder Admin', 'founder@figuraid.test', 'super_admin', $tel], ['Amaka Admin', 'admin@figuraid.test', 'admin', $tel], ['Tunde Ops', 'ops@figuraid.test', 'ops_manager', $tel],
            ['Ngozi Finance', 'finance@figuraid.test', 'finance', $tel], ['Halima HR', 'hr@figuraid.test', 'hr', $tel], ['Chidi Telecom', 'telecom@figuraid.test', 'telecom_ops', $tel],
            ['Bola Web Lead', 'web.manager@figuraid.test', 'unit_manager', $web], ['Musa Support', 'support@figuraid.test', 'support_agent', $web], ['Ife Academy', 'academy@figuraid.test', 'academy_coordinator', $aca],
            ['Kemi Marketing', 'marketing@figuraid.test', 'marketing', $tel], ['Yusuf Staff', 'staff@figuraid.test', 'staff', $pro], ['Ada Auditor', 'auditor@figuraid.test', 'auditor', $tel],
        ];
        $office = Office::first();
        $users = [];
        foreach ($people as $i => [$name, $email, $role, $unit]) {
            $user = User::updateOrCreate(['email' => $email], ['name' => $name, 'password' => $pw, 'status' => 'active', 'role_id' => Role::where('key', $role)->value('id'), 'primary_unit_id' => $unit->id, 'access_expires_at' => $role === 'auditor' ? now()->addMonths(3) : null, 'birthday' => now()->subYears(30)->addDays($i * 17)]);
            $user->forceFill(['email_verified_at' => now(), 'contract_signed_at' => now()->subMonth()])->save();
            $user->units()->syncWithoutDetaching([$unit->id]);
            if ($role !== 'auditor') {
                $user->staffProfile()->updateOrCreate([], ['employee_no' => 'FIG-'.str_pad((string) ($i + 1), 3, '0', STR_PAD_LEFT), 'job_title' => str_replace('_', ' ', ucfirst($role)), 'start_date' => now()->subMonths(6), 'salary' => (string) (250000 + $i * 50000), 'allowances' => [['name' => 'Housing', 'amount' => 50000], ['name' => 'Transport', 'amount' => 30000]], 'bank_name' => 'GTBank', 'bank_account' => '01234567'.str_pad((string) $i, 2, '0', STR_PAD_LEFT), 'account_name' => $name, 'office_id' => $office->id, 'working_days' => [1, 2, 3, 4, 5]]);
            }
            $users[$role] = $user;
        }

        // Attendance: last 15 working days, mix of on time / late / early / absent
        $svc = app(AttendanceService::class);
        foreach (['ops_manager', 'telecom_ops', 'support_agent', 'staff', 'academy_coordinator'] as $k => $role) {
            $user = $users[$role];
            for ($d = CarbonImmutable::now('Africa/Lagos')->subDays(21); $d->lt(CarbonImmutable::now('Africa/Lagos')->startOfDay()); $d = $d->addDay()) {
                if ($d->isWeekend() || (($d->day + $k) % 11 === 0)) {
                    continue; // absent
                }
                $day = AttendanceDay::firstOrCreate(['user_id' => $user->id, 'date' => $d->toDateString()]);
                $in = $d->setTime(8, 40 + (($d->day * 7 + $k * 5) % 35));
                $out = (($d->day + $k) % 9 === 0) ? null : $d->setTime((($d->day + $k) % 7 === 0) ? 16 : 17, 10);
                foreach (array_filter(['in' => $in, 'out' => $out]) as $type => $at) {
                    AttendancePunch::create(['attendance_day_id' => $day->id, 'user_id' => $user->id, 'type' => $type, 'device_time' => $at, 'server_time' => $at, 'latitude' => 9.05165, 'longitude' => 7.49681, 'accuracy_m' => 12, 'distance_m' => 4.1, 'within_geofence' => true, 'office_id' => $office->id, 'flags' => [], 'review_status' => 'not_required']);
                }
                $svc->recompute($user, $d->toDateString());
            }
            $svc->deductionsForMonth($user, now()->format('Y-m'));
        }

        // CRM
        $names = ['Airtel Wholesale', 'Afrinet Carrier', 'Kudi Pay', 'Zenith Logistics', 'Lagos Tech Hub', 'Nile Comms', 'Sahel Telecom', 'Bright Schools', 'MedPlus Clinics', 'Orbit Apps'];
        foreach ($names as $i => $co) {
            $unit = [$tel, $tel, $tel, $pro, $web, $tel, $tel, $aca, $web, $tel][$i];
            $company = Company::firstOrCreate(['name' => $co], ['country' => 'Nigeria']);
            $c = Contact::firstOrCreate(['email_normalized' => 'contact'.$i.'@'.Str::slug($co).'.test'], ['email' => 'contact'.$i.'@'.Str::slug($co).'.test', 'first_name' => ['Emeka', 'Fatima', 'John', 'Grace', 'Sani', 'Aisha', 'Peter', 'Joy', 'Ibrahim', 'Rita'][$i], 'last_name' => 'Demo', 'display_name' => ['Emeka', 'Fatima', 'John', 'Grace', 'Sani', 'Aisha', 'Peter', 'Joy', 'Ibrahim', 'Rita'][$i].' Demo', 'company_id' => $company->id, 'primary_unit_id' => $unit->id, 'owner_id' => $users['telecom_ops']->id, 'phone' => '0803000000'.$i, 'lifecycle' => $i < 4 ? 'customer' : 'lead', 'source_channel' => ['form', 'whatsapp', 'referral', 'import', 'email'][$i % 5], 'tags' => $i % 2 ? ['Carrier Community'] : ['VIP'], 'birthday' => now()->subYears(35)->addDays($i), 'last_activity_at' => now()->subDays($i * 3)]);
            $c->units()->syncWithoutDetaching([$unit->id]);
            $p = Pipeline::where('unit_id', $unit->id)->first();
            $stage = $p->stages()->skip($i % 5)->first();
            Deal::firstOrCreate(['title' => "$co opportunity"], ['unit_id' => $unit->id, 'pipeline_id' => $p->id, 'stage_id' => $stage->id, 'contact_id' => $c->id, 'company_id' => $company->id, 'owner_id' => $users['telecom_ops']->id, 'value' => 500000 * ($i + 1), 'currency' => $i % 3 ? 'NGN' : 'USD', 'status' => $stage->kind, 'source' => 'website', 'expected_close_on' => now()->addDays(10 * $i), 'next_action' => 'Follow up', 'next_action_on' => now()->addDays($i)]);
            if ($i < 5) {
                $conv = Conversation::firstOrCreate(['external_thread_id' => 'demo-'.$i], ['unit_id' => $unit->id, 'contact_id' => $c->id, 'channel' => ['whatsapp', 'email', 'webchat', 'instagram', 'facebook'][$i], 'subject' => 'Enquiry from '.$co, 'assignee_id' => $users['support_agent']->id, 'sla_due_at' => now()->addMinutes(15 - $i * 5), 'last_customer_message_at' => now()->subMinutes($i * 7), 'category' => ['sales', 'support', 'billing', 'sales', 'complaint'][$i]]);
                Message::firstOrCreate(['external_id' => 'demo-msg-'.$i], ['conversation_id' => $conv->id, 'direction' => 'in', 'author_type' => 'contact', 'body' => ['Hi, do you have routes to Ghana?', 'My email stopped working this morning.', 'Please resend invoice for October.', 'What are your SMS rates to Kenya?', 'Our website has been down for an hour!'][$i]]);
            }
        }

        // Work
        foreach (['Send daily rate update to customers', 'Reconcile yesterday\'s Paystack payments', 'Call back Kudi Pay about OTP volumes', 'Prepare cohort 3 timetable', 'Renew NCC licence documents', 'Review vendor rate sheet from Afrinet'] as $i => $t) {
            Task::firstOrCreate(['title' => $t], ['unit_id' => [$tel, $aca, $tel, $aca, $tel, $tel][$i]->id, 'status' => ['todo', 'in_progress', 'todo', 'review', 'todo', 'done'][$i], 'priority' => ['high', 'medium', 'urgent', 'low', 'high', 'medium'][$i], 'origin' => ['sop', 'team_lead', 'ai', 'founder', 'system', 'sop'][$i], 'assignee_id' => array_values($users)[$i + 2]->id, 'creator_id' => $users['ops_manager']->id, 'due_at' => now()->addHours(($i - 2) * 8)]);
        }
        $pb = Playbook::firstOrCreate(['title' => 'Morning rate check'], ['unit_id' => $tel->id, 'body' => 'Open the vendor rate sheets received overnight, check increases above 5%, update sell decks and notify affected customers.', 'steps' => ['Open new vendor decks', 'Compare with yesterday', 'Update sell decks', 'Send route broadcast for approval'], 'frequency' => 'daily', 'due_time' => '10:00', 'default_priority' => 'high']);
        $pb->assignees()->syncWithoutDetaching([$users['telecom_ops']->id]);
        $g = Goal::firstOrCreate(['objective' => 'Grow telecom gross margin'], ['quarter' => now()->year.'-Q'.now()->quarter, 'unit_id' => $tel->id, 'owner_id' => $users['ops_manager']->id]);
        $g->keyResults()->firstOrCreate(['title' => 'Monthly minutes'], ['target' => 5000000, 'current' => 2100000, 'unit_label' => 'min']);
        Announcement::firstOrCreate(['title' => 'Welcome to Figuraid OS'], ['author_id' => $users['super_admin']->id, 'body' => 'Clock in from your phone at /clock when you arrive at Kano House. Work hours are 09:00–17:00.', 'pinned' => true, 'requires_ack' => true]);
        $general = ChatChannel::firstOrCreate(['kind' => 'general', 'name' => 'General']);
        $general->members()->syncWithoutDetaching(collect($users)->pluck('id')->all());
        $general->messages()->firstOrCreate(['body' => 'Morning team — rates from Afrinet are in. Dayo has summarised the changes.'], ['agent_key' => 'vendor']);
        TrainingCourse::firstOrCreate(['title' => 'Security basics for staff'], ['summary' => 'Passwords, 2FA, phishing and handling customer data.', 'body' => "## Why it matters\nWe hold customer, payment and carrier data.\n\n## Rules\n1. Never share passwords or one-time codes.\n2. Turn on two-factor sign-in.\n3. Never paste customer data into public AI tools.\n4. Report suspicious emails to the Ops Manager.", 'quiz' => [['q' => 'A caller asks for your 2FA code. What do you do?', 'options' => ['Give it', 'Refuse and report it'], 'answer' => 1]], 'required_for_new_staff' => true]);

        // FX: last 7 days (parallel market, demo values)
        foreach (range(0, 6) as $d) {
            foreach (['USD' => 1560, 'EUR' => 1690, 'GBP' => 1990] as $cur => $base) {
                FxRate::firstOrCreate(['currency' => $cur, 'date' => today()->subDays($d)->toDateString(), 'basis' => 'parallel'], ['ngn_per_unit' => $base + $d * 3, 'sources' => ['demo'], 'status' => 'accepted']);
            }
        }

        // Telecom
        $cust = Carrier::firstOrCreate(['name' => 'Afrinet Carrier'], ['role' => 'customer', 'country' => 'Ghana', 'currency' => 'USD', 'credit_limit' => 20000, 'status' => 'active', 'kyc_status' => 'verified', 'account_manager_id' => $users['telecom_ops']->id]);
        $vend = Carrier::firstOrCreate(['name' => 'Sahel Telecom'], ['role' => 'vendor', 'country' => 'Niger', 'currency' => 'EUR', 'status' => 'active', 'kyc_status' => 'verified', 'rate_email' => 'rates@sahel.test']);
        $both = Carrier::firstOrCreate(['name' => 'Nile Comms'], ['role' => 'both', 'country' => 'Egypt', 'currency' => 'USD', 'credit_limit' => 10000, 'status' => 'testing', 'kyc_status' => 'pending']);
        $routes = [['Nigeria Mobile', '234', 0.021, 0.025], ['Ghana Mobile', '233', 0.105, 0.118], ['Kenya Mobile', '254', 0.032, 0.036], ['UK Mobile', '447', 0.0085, 0.0099]];
        $buy = RateDeck::firstOrCreate(['name' => 'Sahel November deck'], ['carrier_id' => $vend->id, 'direction' => 'buy', 'route_type' => 'cli', 'currency' => 'EUR', 'effective_from' => today()->subDays(10), 'status' => 'active']);
        $sell = RateDeck::firstOrCreate(['name' => 'Afrinet sell deck'], ['carrier_id' => $cust->id, 'direction' => 'sell', 'route_type' => 'cli', 'currency' => 'USD', 'effective_from' => today()->subDays(10), 'status' => 'active']);
        if (! $buy->rates()->exists()) {
            foreach ($routes as [$dest, $prefix, $b, $s]) {
                $buy->rates()->create(['carrier_id' => $vend->id, 'direction' => 'buy', 'destination' => $dest, 'prefix' => $prefix, 'rate' => $b, 'currency' => 'EUR', 'effective_from' => today()->subDays(10)]);
                $sell->rates()->create(['carrier_id' => $cust->id, 'direction' => 'sell', 'destination' => $dest, 'prefix' => $prefix, 'rate' => $s, 'currency' => 'USD', 'effective_from' => today()->subDays(10)]);
            }
            foreach (range(1, 14) as $d) {
                foreach ($routes as $k => [$dest, $prefix, $b, $s]) {
                    $min = 20000 + ($d * 731 + $k * 977) % 15000 + ($d === 1 && $k === 1 ? 400000 : 0);
                    TrafficEntry::create(['date' => today()->subDays($d), 'customer_carrier_id' => $cust->id, 'vendor_carrier_id' => $vend->id, 'destination' => $dest, 'prefix' => $prefix, 'minutes' => $min, 'attempts' => (int) ($min / 2.5), 'connected' => (int) ($min / 4.1), 'sell_rate' => $s, 'buy_rate' => $b, 'currency' => 'USD', 'revenue' => round($min * $s, 4), 'cost' => round($min * $b * 1.08, 4), 'entered_by_id' => $users['telecom_ops']->id]);
                }
            }
        }

        \App\Models\PortalUser::firstOrCreate(['email' => 'noc@afrinet.test'], ['contact_id' => Contact::first()->id, 'carrier_id' => $cust->id, 'password' => $pw]);
        \App\Models\PortalUser::firstOrCreate(['email' => 'client@lagostechhub.test'], ['contact_id' => Contact::skip(4)->first()->id, 'password' => $pw]);
        \App\Models\ContractTemplate::firstOrCreate(['kind' => 'employment', 'version' => 1], ['title' => 'Employment contract', 'status' => 'approved', 'body' => "This agreement is between Figuraid Ltd and {{name}}, dated {{date}}.\n\nDRAFT — to be reviewed by Figuraid's lawyer before use.\n\n1. Hours: Monday to Friday, 09:00 to 17:00 at Kano House, Abuja.\n2. Attendance deductions: late arrival ₦500; leaving before 17:00 ₦500; absence without approved leave ₦3,000 per day; a missed clock-out is treated as absence.\n3. Confidentiality: customer, carrier, rate and payroll information must not be shared outside Figuraid systems.\n4. Notice: as stated in your offer letter."]);
        \App\Models\ContractTemplate::firstOrCreate(['kind' => 'nda', 'version' => 1], ['title' => 'Confidentiality & acceptable use', 'status' => 'approved', 'body' => "DRAFT — lawyer review pending.\n\nI, {{name}}, will protect customer data under the Nigeria Data Protection Act 2023, use only approved systems, keep my password and two-factor codes private, and report any suspected breach to the Operations Manager immediately."]);

        // Finance
        $mk = function ($unit, $contact, $carrier, $currency, $lines, $status, $daysAgo) use ($users) {
            $inv = Invoice::create(['unit_id' => $unit->id, 'number' => InvoiceService::nextNumber($unit->code), 'contact_id' => $contact?->id, 'carrier_id' => $carrier?->id, 'currency' => $currency, 'fx_rate' => $currency === 'NGN' ? 1 : (float) FxRate::where('currency', $currency)->latest('date')->value('ngn_per_unit'), 'issue_date' => today()->subDays($daysAgo), 'due_date' => today()->subDays($daysAgo - 14), 'status' => $status, 'public_token' => Str::random(40), 'created_by_id' => $users['finance']->id]);
            foreach ($lines as [$d, $q, $p]) {
                $inv->lines()->create(['description' => $d, 'quantity' => $q, 'unit_price' => $p, 'vatable' => true, 'amount' => round($q * $p, 2)]);
            }
            InvoiceService::recalc($inv);

            return $inv->fresh();
        };
        if (! Invoice::exists()) {
            $c0 = Contact::first();
            $i1 = $mk($tel, $c0, $cust, 'USD', [['Voice termination — week 45', 180000, 0.031]], 'sent', 20);
            $i2 = $mk($web, Contact::skip(4)->first(), null, 'NGN', [['Business hosting — annual', 1, 120000], ['Domain .com.ng', 2, 7500]], 'paid', 30);
            $mk($pro, Contact::skip(3)->first(), null, 'NGN', [['Laptops (Dell Latitude)', 5, 650000]], 'sent', 5);
            $i2->forceFill(['amount_paid' => $i2->total])->save();
            Payment::create(['unit_id' => $web->id, 'invoice_id' => $i2->id, 'contact_id' => $i2->contact_id, 'gateway' => 'flutterwave', 'reference' => 'FLW-DEMO-1', 'amount' => $i2->total, 'currency' => 'NGN', 'amount_ngn' => $i2->total, 'paid_at' => now()->subDays(25), 'verified_with_gateway' => true]);
            Payment::create(['unit_id' => $aca->id, 'gateway' => 'paystack', 'reference' => 'PSK-DEMO-1', 'amount' => 150000, 'currency' => 'NGN', 'amount_ngn' => 150000, 'paid_at' => now()->subDays(2), 'verified_with_gateway' => true]);
        }
        $cat = fn ($n) => ExpenseCategory::where('name', $n)->value('id');
        $host = Vendor::firstOrCreate(['name' => 'Namecheap'], ['kind' => 'service', 'currency' => 'USD']);
        $isp = Vendor::firstOrCreate(['name' => 'MainOne'], ['kind' => 'service', 'currency' => 'NGN']);
        Vendor::firstOrCreate(['name' => 'Slot Systems'], ['kind' => 'supplier', 'currency' => 'NGN', 'categories' => ['Laptops', 'Phones'], 'rating' => 4]);
        foreach ([['Office rent — November', 'Rent & office', 'NGN', 850000, 'paid', null], ['Internet — November', 'Internet & telephony', 'NGN', 95000, 'approved', $isp], ['Reseller hosting', 'Hosting & software', 'USD', 120, 'requested', $host], ['Facebook ads', 'Marketing', 'NGN', 150000, 'requested', null]] as [$d, $c, $cur, $amt, $st, $v]) {
            $rate = $cur === 'NGN' ? 1 : (float) FxRate::where('currency', $cur)->latest('date')->value('ngn_per_unit');
            Expense::firstOrCreate(['description' => $d], ['unit_id' => $tel->id, 'category_id' => $cat($c), 'vendor_id' => $v?->id, 'amount' => $amt, 'currency' => $cur, 'fx_rate' => $rate, 'amount_ngn' => round($amt * $rate, 2), 'date' => today()->subDays(3), 'status' => $st, 'requested_by_id' => $users['ops_manager']->id]);
        }
        foreach ([['Reseller hosting (Namecheap)', $host, 'USD', 120, 'monthly', 5, 'own', null], ['Google Workspace', null, 'USD', 84, 'monthly', 12, 'own', null], ['MainOne fibre', $isp, 'NGN', 95000, 'monthly', 20, 'own', null], ['Business hosting — Lagos Tech Hub', null, 'NGN', 120000, 'annually', 14, 'customer', Contact::skip(4)->first()], ['Domain renewal — medplus.ng', null, 'NGN', 7500, 'annually', 7, 'customer', Contact::skip(8)->first()]] as [$n, $v, $cur, $amt, $cy, $days, $side, $c]) {
            Subscription::firstOrCreate(['name' => $n], ['side' => $side, 'unit_id' => $side === 'own' ? $tel->id : $web->id, 'vendor_id' => $v?->id, 'contact_id' => $c?->id, 'amount' => $amt, 'currency' => $cur, 'cycle' => $cy, 'next_due_on' => today()->addDays($days), 'status' => $days === 12 ? 'pending' : 'active']);
        }
        BankAccount::firstOrCreate(['name' => 'Operations (GTBank)'], ['bank' => 'GTBank', 'account_number' => '0123456789', 'currency' => 'NGN', 'opening_balance' => 12500000]);
        Debt::firstOrCreate(['lender' => 'Equipment loan — Demo Bank'], ['principal' => 10000000, 'outstanding' => 6400000, 'interest_rate_pct' => 24, 'start_date' => today()->subMonths(8), 'instalment' => 650000, 'next_payment_on' => today()->addDays(9)]);

        // Academy & procurement
        $course = Course::firstOrCreate(['code' => 'CYB-101'], ['title' => 'Cybersecurity Foundations', 'fee' => 350000, 'weeks' => 12]);
        $cohort = Cohort::firstOrCreate(['name' => 'Cohort 3 — Jan 2027'], ['course_id' => $course->id, 'starts_on' => today()->addMonth(), 'coordinator_id' => $users['academy_coordinator']->id]);
        $student = Contact::skip(7)->first();
        Enrolment::firstOrCreate(['cohort_id' => $cohort->id, 'contact_id' => $student->id], ['fee' => 350000, 'scholarship_pct' => 20, 'amount_paid' => 150000, 'status' => 'enrolled']);
        Rfq::firstOrCreate(['number' => 'RFQ-'.now()->year.'-0001'], ['contact_id' => Contact::skip(3)->first()->id, 'title' => '5 laptops for Zenith Logistics', 'items' => [['name' => 'Dell Latitude 5440', 'qty' => 5, 'spec' => 'i5, 16GB, 512GB']], 'needed_by' => today()->addDays(14), 'status' => 'quoting', 'owner_id' => $users['staff']->id]);
        Document::firstOrCreate(['title' => 'NCC licence'], ['kind' => 'ncc_licence', 'unit_id' => $tel->id, 'expires_on' => today()->addDays(30), 'owner_id' => $users['admin']->id]);
        Document::firstOrCreate(['title' => 'Afrinet interconnect agreement'], ['kind' => 'carrier_agreement', 'unit_id' => $tel->id, 'expires_on' => today()->addMonths(8), 'owner_id' => $users['telecom_ops']->id]);
    }
}
