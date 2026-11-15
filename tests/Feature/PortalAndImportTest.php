<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\PortalUser;
use App\Services\ContactImporter;
use Database\Seeders\CoreSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PortalAndImportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([CoreSeeder::class, DemoSeeder::class]);
    }

    public function test_carrier_portal_shows_only_own_sell_rates(): void
    {
        $p = PortalUser::where('email', 'noc@afrinet.test')->first();
        $this->get('/portal')->assertRedirect('/portal/login');
        $res = $this->actingAs($p, 'portal')->get('/portal')->assertOk()->assertSee('Your rates')->assertSee('Ghana Mobile');
        $res->assertDontSee('Sahel'); // vendor name never shown to customers
    }

    public function test_staff_session_does_not_open_portal_and_vice_versa(): void
    {
        $this->actingAs($this->makeUser('staff'))->get('/portal')->assertRedirect('/portal/login');
    }

    public function test_portal_session_does_not_open_staff_panel(): void
    {
        $p = PortalUser::first();
        $this->actingAs($p, 'portal')->get('/app/tasks')->assertRedirect('/app/login');
    }

    public function test_hosting_client_portal_and_ticket(): void
    {
        $p = PortalUser::where('email', 'client@lagostechhub.test')->first();
        $this->actingAs($p, 'portal')->get('/portal')->assertOk()->assertSee('Your services');
        $this->post('/portal/tickets', ['subject' => 'Email down', 'body' => 'Help'])->assertRedirect();
        $this->assertDatabaseHas('tickets', ['subject' => 'Email down', 'contact_id' => $p->contact_id]);
    }

    public function test_import_dedupes_and_tags(): void
    {
        $f = tempnam(sys_get_temp_dir(), 'imp').'.csv';
        file_put_contents($f, "Name,Email,Phone,Company,Tags\nNew Person,new@x.test,08031234567,NewCo,VIP\nDup,contact0@airtel-wholesale.test,,,\nNobody,,,,\n");
        $r = app(ContactImporter::class)->import($f, Contact::first()->primary_unit_id, ['Carrier Community'], 'test', null);
        $this->assertSame(['created' => 1, 'updated' => 1, 'skipped' => 1], $r);
        $c = Contact::where('email_normalized', 'new@x.test')->first();
        $this->assertSame('2348031234567', $c->phone_e164);
        $this->assertEqualsCanonicalizing(['Carrier Community', 'VIP'], $c->tags);
    }

    public function test_public_pages_render(): void
    {
        foreach (['/', '/request', '/terms', '/privacy', '/portal/login', '/sitemap.xml'] as $u) {
            $this->get($u)->assertOk();
        }
        $inv = \App\Models\Invoice::first();
        $this->get('/q/'.$inv->public_token)->assertOk()->assertSee($inv->number);
        $this->get('/verify/NOPE')->assertOk()->assertSee('Not found');
        $this->get('/book/'.\App\Models\User::first()->id)->assertOk();
    }
}
