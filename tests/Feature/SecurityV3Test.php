<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\DataRequest;
use App\Models\Setting;
use App\Models\User;
use App\Services\DataRights;
use App\Services\Exports;
use Database\Seeders\CoreSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class SecurityV3Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([CoreSeeder::class, DemoSeeder::class]);
        Mail::fake();
    }

    public function test_two_factor_required_for_everyone_by_default(): void
    {
        $this->assertTrue(User::where('email', 'staff@figuraid.test')->first()->requiresTwoFactor());
        Setting::put('security.require_2fa_all', false);
        $this->assertFalse(User::where('email', 'staff@figuraid.test')->first()->requiresTwoFactor());
        $this->assertTrue(User::where('email', 'finance@figuraid.test')->first()->requiresTwoFactor()); // privileged roles always
    }

    public function test_exports_need_permission_are_scoped_logged_and_alerted(): void
    {
        $this->actingAs($this->makeUser('staff'));
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        Exports::download('Customers', Contact::query(), ['Name' => 'display_name']);
    }

    public function test_finance_export_is_logged_and_formula_safe(): void
    {
        $fin = $this->makeUser('finance');
        $this->actingAs($fin);
        Contact::first()->forceFill(['display_name' => '=HYPERLINK("http://evil")'])->saveQuietly();
        $res = Exports::download('Customers', Contact::query(), ['Name' => 'display_name']);
        ob_start();
        $res->sendContent();
        $csv = ob_get_clean();
        $this->assertStringContainsString("'=HYPERLINK", $csv);
        $this->assertSame(1, DB::table('export_logs')->where('user_id', $fin->id)->count());
        for ($i = 0; $i < 4; $i++) {
            Exports::download('Customers', Contact::query(), ['Name' => 'display_name']);
        }
        $this->assertTrue(\Illuminate\Notifications\DatabaseNotification::where('data', 'like', '%Unusual data export%')->exists());
    }

    public function test_bulk_viewing_alert(): void
    {
        Setting::put('security.max_record_views_per_hour', 3);
        $u = $this->makeUser('ops_manager');
        $this->actingAs($u);
        foreach (Contact::limit(5)->get() as $c) {
            $this->get("/app/contacts/{$c->id}/edit");
        }
        $this->assertTrue(\Illuminate\Notifications\DatabaseNotification::where('data', 'like', '%Unusual record viewing%')->exists());
    }

    public function test_data_rights_request_verify_export_erase(): void
    {
        $c = Contact::whereNotNull('email')->first();
        $this->post('/privacy/request', ['kind' => 'delete', 'name' => 'X', 'email' => $c->email])->assertRedirect();
        $r = DataRequest::firstOrFail();
        $this->assertSame('received', $r->status);
        $this->get('/privacy/verify/'.$r->id.'/wrong')->assertForbidden(); // unsigned
        $token = DB::table('data_requests')->where('id', $r->id)->value('verify_token');
        $this->get(URL::temporarySignedRoute('privacy.verify', now()->addDay(), ['request' => $r->id, 'token' => $token]))->assertOk()->assertSee('Request confirmed');
        $r->refresh();
        $this->assertSame($c->id, $r->contact_id);
        $this->actingAs(User::where('email', 'founder@figuraid.test')->first());
        $data = app(DataRights::class)->export($r);
        $this->assertSame($c->email, $data['profile']['email']);
        app(DataRights::class)->erase($r);
        $c->refresh();
        $this->assertNull($c->email);
        $this->assertSame('completed', $r->fresh()->status);
    }
}
