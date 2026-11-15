<?php

namespace Tests\Feature;

use App\Models\Carrier;
use App\Models\MarginRule;
use App\Models\RateDeck;
use App\Models\RouteBroadcast;
use App\Services\BroadcastService;
use App\Services\RateDeckService;
use Database\Seeders\CoreSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/** v2 telecom rules: voice TDM/CC/CLI min 4% / target 8%; SMS no fixed minimum but never below cost. */
class TelecomV2Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([CoreSeeder::class, DemoSeeder::class]);
    }

    public function test_default_margin_rules(): void
    {
        foreach (['tdm', 'cc', 'cli'] as $t) {
            $this->assertEquals(4, MarginRule::where('service', $t)->whereNull('prefix')->value('min_margin_pct'));
            $this->assertEquals(8, RateDeckService::targetMargin($t));
        }
        $this->assertNull(RateDeckService::targetMargin('sms'));
        $this->assertNull(RateDeckService::marginRules('sms')[0]);
    }

    public function test_builder_prices_at_8_percent_and_passes_4_percent_floor(): void
    {
        $cust = Carrier::where('name', 'Nile Comms')->first();
        $deck = app(RateDeckService::class)->buildSellDeck($cust, 'cli', 'EUR', today()->toDateString());
        $ng = $deck->rates()->where('prefix', '234')->first();
        $this->assertEqualsWithDelta(0.021 / 0.92, (float) $ng->rate, 0.00001);
        $this->assertSame([], $deck->validation['blocking']);
        app(RateDeckService::class)->approve($deck, $this->makeUser('telecom_ops')->id);
        $this->assertSame('active', $deck->fresh()->status);
    }

    public function test_voice_below_4_percent_is_blocked_but_sms_only_blocks_below_cost(): void
    {
        $svc = app(RateDeckService::class);
        $cust = Carrier::where('name', 'Nile Comms')->first();
        $deck = $svc->buildSellDeck($cust, 'cli', 'EUR', today()->toDateString(), 3);
        $this->assertNotEmpty($deck->validation['blocking']);
        $this->expectException(\RuntimeException::class);
        $svc->approve($deck, $this->makeUser('telecom_ops')->id);
    }

    public function test_sms_needs_an_explicit_margin_and_cannot_go_below_cost(): void
    {
        $svc = app(RateDeckService::class);
        $vend = Carrier::where('name', 'Sahel Telecom')->first();
        $buy = RateDeck::forceCreate(['carrier_id' => $vend->id, 'direction' => 'buy', 'route_type' => 'sms', 'name' => 'SMS buy', 'currency' => 'EUR', 'effective_from' => today(), 'status' => 'active']);
        $buy->rates()->create(['carrier_id' => $vend->id, 'direction' => 'buy', 'route_type' => 'sms', 'destination' => 'Nigeria SMS', 'prefix' => '234', 'rate' => 0.01, 'currency' => 'EUR', 'effective_from' => today()]);
        $cust = Carrier::where('name', 'Nile Comms')->first();
        try {
            $svc->buildSellDeck($cust, 'sms', 'EUR', today()->toDateString());
            $this->fail('SMS should require a margin');
        } catch (\RuntimeException) {
        }
        $thin = $svc->buildSellDeck($cust, 'sms', 'EUR', today()->toDateString(), 1); // 1% is allowed for SMS
        $this->assertSame([], $thin->validation['blocking']);
        $thin->rates()->update(['rate' => 0.009]); // below cost
        $this->assertSame('below_cost', $svc->validate($thin->fresh())['blocking'][0]['problem']);
    }

    public function test_broadcast_needs_second_person_then_emails_csv(): void
    {
        Mail::fake();
        $ops = $this->makeUser('telecom_ops');
        $deck = RateDeck::where('direction', 'sell')->where('status', 'active')->first();
        $cust = Carrier::where('name', 'Afrinet Carrier')->first();
        $cust->contacts()->create(['name' => 'Rates desk', 'role' => 'rates', 'email' => 'rates@afrinet.test']);
        $b = RouteBroadcast::forceCreate(['subject' => 'Routes', 'body' => 'Hi', 'rate_deck_id' => $deck->id, 'recipient_carrier_ids' => [$cust->id], 'created_by_id' => $ops->id]);
        $svc = app(BroadcastService::class);
        try {
            $svc->approve($b, $ops);
            $this->fail('Author must not approve');
        } catch (\RuntimeException) {
        }
        $svc->approve($b, $this->makeUser('admin'));
        $log = $svc->send($b->fresh());
        $this->assertSame('sent', $log[0]['status']);
        $this->assertStringContainsString('Ghana Mobile', BroadcastService::csv($b));
        $this->assertStringNotContainsString('Sahel', BroadcastService::csv($b));
    }
}
