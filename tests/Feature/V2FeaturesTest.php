<?php

namespace Tests\Feature;

use App\Models\Campaign;
use App\Models\Carrier;
use App\Models\Consent;
use App\Models\Contact;
use App\Models\TrafficEntry;
use App\Services\CalendarFeed;
use App\Services\CampaignService;
use App\Services\CdrService;
use Database\Seeders\CoreSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class V2FeaturesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([CoreSeeder::class, DemoSeeder::class]);
    }

    public function test_campaign_reaches_only_opted_in_contacts_and_unsubscribe_works(): void
    {
        Mail::fake();
        $optedIn = Contact::whereIn('id', Consent::where('granted', true)->pluck('contact_id'))->get();
        $this->assertCount(3, $optedIn);
        $c = Campaign::create(['unit_id' => $optedIn[0]->primary_unit_id, 'name' => 'T', 'subject' => 'Hi', 'body' => 'Hello {first_name}', 'audience' => [], 'created_by_id' => $this->makeUser('marketing')->id]);
        try {
            app(CampaignService::class)->approve($c, \App\Models\User::find($c->created_by_id));
            $this->fail('author cannot approve');
        } catch (\RuntimeException) {
        }
        app(CampaignService::class)->approve($c, $this->makeUser('admin'));
        $this->assertSame(3, $c->fresh()->recipients);
        $this->assertSame(3, app(CampaignService::class)->sendBatch());
        $this->assertSame('sent', $c->fresh()->status);

        $who = $optedIn[0];
        $this->get(URL::signedRoute('unsubscribe', ['contact' => $who->id]))->assertOk();
        $this->get('/unsubscribe/'.$who->id)->assertForbidden(); // unsigned link refused
        $this->assertFalse(CampaignService::audience([])->pluck('contacts.id')->contains($who->id));
    }

    public function test_calendar_feed_is_private_and_lists_tasks(): void
    {
        $u = $this->makeUser('staff');
        \App\Models\Task::create(['title' => 'Call Kudi Pay', 'assignee_id' => $u->id, 'due_at' => now()->addDay()]);
        $token = CalendarFeed::tokenFor($u);
        $this->get("/calendar/$token.ics")->assertOk()->assertHeader('Content-Type', 'text/calendar; charset=utf-8')->assertSee('Task: Call Kudi Pay');
        $this->get('/calendar/'.str_repeat('a', 48).'.ics')->assertNotFound();
    }

    public function test_cdr_upload_rates_calls_with_increments(): void
    {
        $cust = Carrier::where('name', 'Afrinet Carrier')->first();
        $f = tempnam(sys_get_temp_dir(), 'cdr').'.csv';
        file_put_contents($f, "start_time,called_number,billsec\n2026-11-14 10:00:00,+233241234567,61\n2026-11-14 10:05:00,233201234567,30\n2026-11-14 11:00:00,99912345,10\nbad,233,5\n");
        $imp = app(CdrService::class)->import($cust, $f, $this->makeUser('telecom_ops')->id);
        $this->assertSame(3, $imp->calls);
        $this->assertSame(1, $imp->unrated);
        $this->assertEquals(3.0, (float) $imp->billed_minutes); // 61s → 2 min, 30s → 1 min at 60/60
        $t = TrafficEntry::where('cdr_import_id', $imp->id)->first();
        $this->assertSame('233', $t->prefix);
        $this->assertEqualsWithDelta(3 * 0.118, (float) $t->revenue, 0.0001);
    }
}
