<?php

namespace Tests\Feature;

use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Enrolment;
use App\Models\PortalUser;
use App\Services\Certificates;
use App\Services\ChannelSender;
use App\Services\PortalAccess;
use Database\Seeders\CoreSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class V3MiscTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([CoreSeeder::class, DemoSeeder::class]);
        Mail::fake();
    }

    public function test_whatsapp_free_text_blocked_after_24_hours(): void
    {
        $c = Conversation::where('channel', 'whatsapp')->first();
        $c->forceFill(['last_customer_message_at' => now()->subHours(30)])->save();
        $this->assertFalse(ChannelSender::insideWindow($c));
        $this->expectException(\RuntimeException::class);
        app(ChannelSender::class)->send($c, 'Hello', null);
    }

    public function test_certificate_only_when_completed_and_paid_then_verifiable(): void
    {
        $e = Enrolment::first();
        try {
            app(Certificates::class)->issue($e);
            $this->fail('should need completion');
        } catch (\RuntimeException) {
        }
        $e->forceFill(['status' => 'completed', 'amount_paid' => $e->fee])->save();
        $e = app(Certificates::class)->issue($e->fresh());
        $this->assertMatchesRegularExpression('/^FA-[A-Z0-9]{4}-[A-Z0-9]{4}$/', $e->certificate_code);
        $this->assertStringStartsWith('%PDF', app(Certificates::class)->pdf($e));
        $this->get('/verify/'.$e->certificate_code)->assertOk()->assertSee('Certificate verified');
    }

    public function test_portal_invite_sets_password_by_signed_link_only(): void
    {
        $c = Contact::whereNotNull('email')->first();
        $p = app(PortalAccess::class)->invite($c);
        $token = DB::table('portal_users')->where('id', $p->id)->value('invite_token');
        $this->get("/portal/password/{$p->id}/$token")->assertForbidden(); // unsigned
        $url = URL::temporarySignedRoute('portal.password', now()->addDay(), ['portalUser' => $p->id, 'token' => $token]);
        $this->post($url, ['password' => 'NewSecret-123', 'password_confirmation' => 'NewSecret-123'])->assertRedirect('/portal');
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check('NewSecret-123', PortalUser::find($p->id)->password));
        $this->post($url, ['password' => 'Again-12345', 'password_confirmation' => 'Again-12345'])->assertForbidden(); // link used up
    }
}
