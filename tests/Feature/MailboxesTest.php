<?php

namespace Tests\Feature;

use App\Models\Carrier;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\RateDeck;
use App\Services\AiGateway;
use App\Services\Mail\InboundEmail;
use App\Services\Mail\ParsedEmail;
use Database\Seeders\CoreSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Tests\TestCase;

class MailboxesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([CoreSeeder::class, DemoSeeder::class]);
        $this->app->instance(AiGateway::class, new class extends AiGateway
        {
            public function complete(string $s, string $p, string $t = 'light', bool $search = false, bool $mask = true): array
            {
                return ['text' => '{}', 'provider' => 'x', 'model' => 'x'];
            }
        });
    }

    private function email(string $from, string $to, string $subject, string $text, ?array $csv = null, string $id = null): string
    {
        $id ??= '<'.uniqid().'@test>';
        $b = 'BOUNDARY42';
        $raw = "From: $from\r\nTo: $to\r\nSubject: $subject\r\nMessage-ID: $id\r\nMIME-Version: 1.0\r\n";
        if (! $csv) {
            return $raw."Content-Type: text/plain; charset=utf-8\r\n\r\n$text\r\n";
        }
        [$name, $content] = $csv;

        return $raw."Content-Type: multipart/mixed; boundary=\"$b\"\r\n\r\n--$b\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n$text\r\n--$b\r\nContent-Type: text/csv; name=\"$name\"\r\nContent-Disposition: attachment; filename=\"$name\"\r\nContent-Transfer-Encoding: base64\r\n\r\n".chunk_split(base64_encode($content))."--$b--\r\n";
    }

    public function test_known_vendor_rates_go_live_update_contacts_and_flag_sell_margins(): void
    {
        $sahel = Carrier::where('name', 'Sahel Telecom')->first(); // verified, active vendor; rate_email rates@sahel.test
        $csv = "Destination,Prefix,Rate,Effective Date\nNigeria Mobile,234,0.0300,".today()->toDateString()."\nGhana Mobile,233,0.1050,\nKenya Mobile,254,0.0320,\nUK Mobile,447,0.0085,\nSouth Africa,27,0.0150,\n";
        $r = app(InboundEmail::class)->process($this->email('Sahel Rates <pricing@sahel.test>', 'rates@figuraid.com', 'Sahel CLI rates EUR', 'Please find attached.', ['sahel.csv', $csv]));
        $this->assertSame('Sahel Telecom', $r['carrier']);
        $this->assertTrue($r['decks'][0]['live']);
        $this->assertSame('EUR', $r['decks'][0]['currency']);
        $this->assertSame(1, $r['decks'][0]['compare']['increase']); // Nigeria 0.021 → 0.030
        $this->assertSame(1, RateDeck::where('carrier_id', $sahel->id)->where('direction', 'buy')->where('status', 'active')->count()); // old deck superseded
        $this->assertTrue($sahel->contacts()->where('email', 'pricing@sahel.test')->where('role', 'rates')->exists()); // same domain → matched, contact added
        $this->assertTrue(DatabaseNotification::where('data', 'like', '%Sell rates need repricing%')->exists()); // Afrinet NG sell 0.025 USD now below cost
    }

    public function test_unknown_sender_with_rate_sheet_becomes_vendor_lead_with_draft_deck(): void
    {
        $csv = "Code,Country,Price\n234,Nigeria,0.02\n233,Ghana,0.10\n254,Kenya,0.03\n27,South Africa,0.01\n44,UK,0.005\n";
        $r = app(InboundEmail::class)->process($this->email('Orion Voice NOC <rates@orionvoice.test>', 'rate@figuraid.com', 'Daily rates USD', 'Today', ['orion.csv', $csv]));
        $this->assertTrue($r['new_vendor']);
        $c = Carrier::where('rate_email', 'rates@orionvoice.test')->firstOrFail();
        $this->assertSame(['vendor', 'testing', 'pending'], [$c->role, $c->status, $c->kyc_status]);
        $this->assertSame('draft', RateDeck::where('carrier_id', $c->id)->first()->status);
        $lead = Contact::where('email_normalized', 'rates@orionvoice.test')->first();
        $this->assertContains('Vendor lead', $lead->tags);
        $this->assertTrue($lead->activities()->where('summary', 'like', 'Rate sheet received%')->exists());
    }

    public function test_rates_email_without_sheet_goes_to_inbox_and_duplicates_are_ignored(): void
    {
        $raw = $this->email('Someone <hello@random.test>', 'rates@figuraid.com', 'Can you send your rates?', 'Hi, please share A-Z.', null, '<dup-1@test>');
        app(InboundEmail::class)->process($raw);
        $this->assertSame(['skipped' => 'duplicate'], app(InboundEmail::class)->process($raw));
        $conv = Conversation::where('channel', 'email')->where('external_thread_id', 'hello@random.test')->firstOrFail();
        $this->assertSame('rates', $conv->category);
        $this->assertSame('rates@figuraid.com', $conv->channel_account);
    }

    public function test_billing_mail_reaches_inbox_and_alerts_finance(): void
    {
        app(InboundEmail::class)->process($this->email('Kudi Pay <accounts@kudipay.test>', 'billing@figuraid.com', 'Invoice query FIG-TEL-2026-0001', "Hello, we think week 45 is overbilled.\n\nOn Mon, Figuraid wrote:\n> old text"));
        $conv = Conversation::where('channel_account', 'billing@figuraid.com')->firstOrFail();
        $this->assertSame('billing', $conv->category);
        $this->assertStringNotContainsString('old text', $conv->messages()->first()->body);
        $this->assertTrue(DatabaseNotification::where('data', 'like', '%Billing@ email%')->exists());
        $noc = app(InboundEmail::class)->process($this->email('Carrier NOC <noc@afrinet.test>', 'noc@figuraid.com', 'Route down to Ghana', 'ASR dropped to 0'));
        $this->assertSame('high', Conversation::find($noc['conversation'])->priority);
    }

    public function test_our_own_and_robot_senders_are_ignored(): void
    {
        $this->assertSame(['skipped' => 'system sender'], app(InboundEmail::class)->process($this->email('info@figuraid.com', 'sales@figuraid.com', 'x', 'y')));
        $this->assertSame(['skipped' => 'system sender'], app(InboundEmail::class)->process($this->email('MAILER-DAEMON@mx.test', 'sales@figuraid.com', 'Undelivered', 'y')));
    }

    public function test_quoted_history_is_stripped(): void
    {
        $this->assertSame('Thanks, received.', ParsedEmail::stripQuoted("Thanks, received.\n\nOn Tue, 3 Nov 2026 at 10:00, Ops wrote:\n> earlier"));
    }
}
