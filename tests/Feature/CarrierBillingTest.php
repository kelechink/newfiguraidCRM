<?php

namespace Tests\Feature;

use App\Models\BillingCycle;
use App\Models\Carrier;
use App\Models\Dispute;
use App\Models\TrafficEntry;
use App\Services\CarrierBilling;
use Database\Seeders\CoreSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CarrierBillingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([CoreSeeder::class, DemoSeeder::class]);
    }

    public function test_postpaid_cycle_invoices_traffic_once_with_7_3_terms(): void
    {
        $c = Carrier::where('name', 'Afrinet Carrier')->first();
        $c->forceFill(['billing_mode' => 'postpaid', 'billing_cycle' => '7/3', 'cycle_anchor' => today()->subDays(21)])->save();
        $svc = app(CarrierBilling::class);
        $this->assertSame(1, $svc->closeCycles()['invoices']);
        $this->assertSame(0, $svc->closeCycles()['invoices']); // idempotent
        $cycle = BillingCycle::where('carrier_id', $c->id)->where('side', 'customer')->first();
        $expected = (float) TrafficEntry::where('customer_carrier_id', $c->id)->where('date', '>=', $cycle->period_start)->where('date', '<', $cycle->period_end)->sum('revenue');
        $this->assertEqualsWithDelta($expected, (float) $cycle->invoice->total, 0.05);
        $this->assertSame('sent', $cycle->invoice->status);
        $this->assertSame(3, (int) $cycle->period_end->diffInDays($cycle->due_date));
        $this->assertEquals(0, (float) $cycle->invoice->vat); // USD wholesale: no VAT by default
        $this->assertNotNull($cycle->invoice->fx_rate);
    }

    public function test_prepaid_burn_low_balance_and_suspension(): void
    {
        $c = Carrier::where('name', 'Afrinet Carrier')->first();
        $svc = app(CarrierBilling::class);
        $svc->topUp($c, 3000, 'Bank TRF 123', null);
        $c->forceFill(['low_balance_threshold' => 2000])->save();
        $this->assertSame(1, $svc->burnPrepaid());
        $this->assertSame(0, $svc->burnPrepaid()); // never charged twice for a day
        $c->refresh();
        $this->assertLessThan(3000, (float) $c->prepaid_balance);
        for ($d = 2; $d <= 5; $d++) {
            $svc->burnPrepaid(today()->subDays($d)->toDateString());
        }
        $this->assertNotNull($c->fresh()->suspended_at);
        $svc->topUp($c->fresh(), 100000, 'Bank TRF 124', null);
        $this->assertNull($c->fresh()->suspended_at);
    }

    public function test_vendor_statement_mismatch_opens_dispute(): void
    {
        $v = Carrier::where('name', 'Sahel Telecom')->first();
        $v->forceFill(['cycle_anchor' => today()->subDays(21)])->save();
        app(CarrierBilling::class)->closeCycles();
        $cycle = BillingCycle::where('carrier_id', $v->id)->where('side', 'vendor')->firstOrFail();
        $this->assertSame('matched', app(CarrierBilling::class)->recordStatement($cycle, (float) $cycle->minutes, (float) $cycle->amount * 1.005));
        $this->assertSame('mismatch', app(CarrierBilling::class)->recordStatement($cycle->fresh(), (float) $cycle->minutes, (float) $cycle->amount * 1.2));
        $this->assertTrue(Dispute::where('carrier_id', $v->id)->exists());
    }

    public function test_prepaid_balance_cannot_be_typed_into_the_form(): void
    {
        $c = Carrier::first();
        $c->fill(['prepaid_balance' => 999999])->save();
        $this->assertNotEquals(999999, (float) $c->fresh()->prepaid_balance);
    }
}
