<?php

namespace Tests\Feature;

use App\Authz\Access;
use App\Filament\Resources\Carriers\CarrierResource;
use App\Filament\Resources\Contacts\ContactResource;
use App\Filament\Resources\Invoices\InvoiceResource;
use App\Filament\Resources\PayrollRuns\PayrollRunResource;
use App\Filament\Resources\RateDecks\RateDeckResource;
use App\Filament\Resources\StaffProfiles\StaffProfileResource;
use App\Models\BusinessUnit;
use App\Models\Contact;
use App\Models\RateDeck;
use App\Models\User;
use Database\Seeders\CoreSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([CoreSeeder::class, DemoSeeder::class]);
    }

    public function test_guests_are_sent_to_login(): void
    {
        $this->get('/app')->assertRedirect('/app/login');
        $this->get(InvoiceResource::getUrl('index'))->assertRedirect();
        $this->get('/clock')->assertRedirect('/app/login');
    }

    public function test_deny_by_default_for_unknown_module_and_inactive_user(): void
    {
        $u = $this->makeUser('staff');
        $this->assertFalse(Access::can($u, 'no.such.module'));
        $this->assertTrue(Access::can($u, 'tasks'));
        $u->forceFill(['status' => 'exited'])->save();
        Access::flush();
        $this->assertFalse(Access::can($u->fresh(), 'tasks'));
    }

    public function test_staff_cannot_open_finance_payroll_or_buy_rates(): void
    {
        $this->actingAs($this->makeUser('staff'));
        $this->get(InvoiceResource::getUrl('index'))->assertForbidden();
        $this->get(PayrollRunResource::getUrl('index'))->assertForbidden();
        $this->get(CarrierResource::getUrl('index'))->assertForbidden();
        $this->get('/app/finance-dashboard')->assertForbidden();
    }

    public function test_hr_sees_staff_records_but_not_salaries(): void
    {
        $hr = $this->makeUser('hr');
        $this->assertTrue(Access::can($hr, 'hr.staff'));
        $this->assertFalse(Access::can($hr, 'hr.salaries'));
        $this->assertFalse(Access::can($hr, 'hr.bank_details'));
        $this->actingAs($hr)->get(StaffProfileResource::getUrl('index'))->assertOk();
        $edit = $this->get(StaffProfileResource::getUrl('edit', ['record' => \App\Models\StaffProfile::first()]));
        $edit->assertOk()->assertDontSee('Monthly basic');
    }

    public function test_telecom_ops_cannot_see_vendor_buy_decks(): void
    {
        $ops = $this->makeUser('telecom_ops');
        $this->actingAs($ops);
        $this->assertFalse(Access::can($ops, 'telecom.buy_rates'));
        $ids = RateDeckResource::getEloquentQuery()->pluck('direction')->unique()->values()->all();
        $this->assertSame(['sell'], $ids);
        $buy = RateDeck::where('direction', 'buy')->first();
        $this->get(RateDeckResource::getUrl('edit', ['record' => $buy]))->assertNotFound();
    }

    public function test_own_scope_only_shows_own_contacts(): void
    {
        $staff = $this->makeUser('staff');
        $mine = Contact::create(['display_name' => 'Mine', 'primary_unit_id' => BusinessUnit::first()->id, 'owner_id' => $staff->id]);
        $this->actingAs($staff);
        $visible = ContactResource::getEloquentQuery()->pluck('id')->all();
        $this->assertSame([$mine->id], $visible);
        $other = Contact::where('id', '!=', $mine->id)->first();
        $this->get(ContactResource::getUrl('edit', ['record' => $other]))->assertNotFound();
    }

    public function test_unit_manager_limited_to_own_unit(): void
    {
        $web = BusinessUnit::where('code', 'FIGUREWEB')->first();
        $m = $this->makeUser('unit_manager', ['primary_unit_id' => $web->id]);
        $this->actingAs($m);
        $units = ContactResource::getEloquentQuery()->pluck('primary_unit_id')->unique()->values()->all();
        $this->assertSame([$web->id], $units);
    }

    public function test_expired_auditor_has_no_access_and_auditor_is_read_only(): void
    {
        $a = $this->makeUser('auditor', ['access_expires_at' => now()->addDay()]);
        $this->assertTrue(Access::can($a, 'finance.invoices'));
        $this->assertFalse(Access::can($a, 'finance.invoices', 'edit'));
        $this->assertFalse(Access::can($a, 'exports', 'create'));
        $a->forceFill(['access_expires_at' => now()->subDay()])->save();
        Access::flush();
        $this->assertFalse(Access::can($a->fresh(), 'finance.invoices'));
    }

    public function test_onboarding_staff_are_held_until_contract_signed(): void
    {
        $u = $this->makeUser('staff', ['status' => 'onboarding']);
        $this->actingAs($u)->get('/app/tasks')->assertRedirect('/app/onboarding');
        $this->get('/app/onboarding')->assertOk();
        $this->assertFalse(Access::can($u, 'tasks'));
    }

    public function test_temporary_grant_widens_then_expires(): void
    {
        $u = $this->makeUser('staff');
        $this->assertFalse(Access::can($u, 'finance.reports'));
        $g = $u->grants()->create(['module' => 'finance.reports', 'action' => 'view', 'scope' => 'all', 'expires_at' => now()->addHour(), 'reason' => 'Audit prep']);
        Access::flush();
        $this->assertTrue(Access::can($u, 'finance.reports'));
        $g->forceFill(['expires_at' => now()->subMinute()])->save();
        Access::flush();
        $this->assertFalse(Access::can($u, 'finance.reports'));
    }

    public function test_audit_log_is_append_only_and_chain_verifies(): void
    {
        $log = \App\Models\AuditLog::first();
        $this->expectException(\LogicException::class);
        $log->update(['action' => 'tampered']);
    }

    public function test_audit_chain_command_passes(): void
    {
        $this->artisan('audit:verify')->assertSuccessful();
    }

    public function test_encrypted_salary_never_in_audit_trail_or_plain_in_db(): void
    {
        $p = \App\Models\StaffProfile::first();
        $raw = \DB::table('staff_profiles')->where('id', $p->id)->value('salary');
        $this->assertNotSame((string) $p->salary, $raw);
        $this->assertStringNotContainsString((string) $p->salary, (string) \DB::table('audit_logs')->where('entity_type', 'StaffProfile')->pluck('after')->implode(' '));
    }

    public function test_webhooks_reject_bad_signatures(): void
    {
        config(['services.paystack.secret' => 'sk_test', 'services.meta.app_secret' => 'meta']);
        $this->postJson('/webhooks/paystack', ['event' => 'charge.success'], ['x-paystack-signature' => 'nope'])->assertStatus(401);
        $this->postJson('/webhooks/meta', ['object' => 'page'], ['x-hub-signature-256' => 'sha256=bad'])->assertStatus(401);
        $this->postJson('/webhooks/flutterwave', [], [])->assertStatus(401);
    }

    public function test_public_request_form_creates_lead_deal_and_consent(): void
    {
        $this->post('/request', ['service' => 'A2P SMS', 'name' => 'Jane Test', 'company' => 'Acme', 'email' => 'Jane@Acme.test', 'marketing' => 'on'])->assertRedirect();
        $c = Contact::where('email_normalized', 'jane@acme.test')->firstOrFail();
        $this->assertSame('form', $c->source_channel);
        $this->assertTrue($c->deals()->exists());
        $this->assertDatabaseHas('consents', ['contact_id' => $c->id, 'granted' => 1]);
        $sub = \App\Models\FormSubmission::where('contact_id', $c->id)->first();
        $this->assertSame(config('site.terms_version'), $sub->accepted['terms_version']);
        $this->post('/request', ['service' => 'A2P SMS', 'name' => 'Bot', 'company' => 'x', 'email' => 'bot@x.test', 'website' => 'spam'])->assertRedirect();
        $this->assertDatabaseMissing('contacts', ['email_normalized' => 'bot@x.test']);
    }

    public function test_security_headers_present(): void
    {
        $r = $this->get('/');
        $r->assertOk()->assertHeader('X-Frame-Options', 'DENY')->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->assertStringContainsString("frame-ancestors 'none'", $r->headers->get('Content-Security-Policy'));
    }

    public function test_forms_cannot_self_approve_or_spoof_authorship(): void
    {
        $staff = $this->makeUser('staff');
        $this->actingAs($staff);
        $e = \App\Models\Expense::create(['unit_id' => $staff->primary_unit_id, 'description' => 'Taxi', 'amount' => 5000, 'currency' => 'NGN', 'date' => today(),
            'status' => 'approved', 'approved_by_id' => $staff->id, 'requested_by_id' => \App\Models\User::first()->id, 'amount_ngn' => 1]);
        $e->refresh();
        $this->assertSame('requested', $e->status);
        $this->assertNull($e->approved_by_id);
        $this->assertSame($staff->id, $e->requested_by_id);
        $this->assertEquals(5000, (float) $e->amount_ngn);

        $other = \App\Models\User::where('email', 'support@figuraid.test')->first();
        $l = \App\Models\LeaveRequest::create(['user_id' => $other->id, 'type' => 'annual', 'start_date' => today(), 'end_date' => today(), 'days' => 1, 'status' => 'approved']);
        $l->refresh();
        $this->assertSame('pending', $l->status);
        $this->assertSame($staff->id, $l->user_id);

        $b = \App\Models\RouteBroadcast::create(['subject' => 'x', 'body' => 'y', 'recipient_carrier_ids' => [], 'created_by_id' => $other->id, 'status' => 'approved']);
        $this->assertSame($staff->id, $b->fresh()->created_by_id);
        $this->assertSame('draft', $b->fresh()->status);
    }

    public function test_admin_cannot_edit_super_admin(): void
    {
        $sa = \App\Models\User::where('email', 'founder@figuraid.test')->first();
        $this->actingAs($this->makeUser('admin'));
        $this->assertFalse(\App\Filament\Resources\Users\UserResource::canEdit($sa));
    }

    public function test_pipeline_quick_view_cannot_open_deals_outside_scope(): void
    {
        $staff = $this->makeUser('staff');
        $this->actingAs($staff);
        $other = \App\Models\Deal::where('owner_id', '!=', $staff->id)->first();
        \Livewire\Livewire::test(\App\Filament\Pages\DealsBoard::class)->set('quick', $other->id)->assertDontSee($other->title);
    }
}
