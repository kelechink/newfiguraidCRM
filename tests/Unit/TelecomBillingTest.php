<?php

namespace Tests\Unit;

use App\Domain\Money;
use App\Domain\Telecom;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

class TelecomBillingTest extends TestCase
{
    public function test_billing_increments(): void
    {
        $this->assertEquals(60, Telecom::billSeconds(1, 60, 60));
        $this->assertEquals(120, Telecom::billSeconds(61, 60, 60));
        $this->assertEquals(61, Telecom::billSeconds(61, 1, 1));
        $this->assertEquals(36, Telecom::billSeconds(31, 30, 6));
        $this->assertEquals(0, Telecom::billSeconds(0, 60, 60));
        $this->assertEquals(2.0, Telecom::billedMinutes(90, 1, 60, 60));
    }

    public function test_margin_and_hard_block_below_cost_or_minimum(): void
    {
        $m = Telecom::margin(1000, 900);
        $this->assertEquals(10.0, $m['margin_pct']);
        $this->assertSame('below_cost', Telecom::checkSellRate(0.020, 0.021, 5));
        $this->assertSame('below_min_margin', Telecom::checkSellRate(0.0215, 0.021, 5));
        $this->assertNull(Telecom::checkSellRate(0.025, 0.021, 5));
        $this->assertNull(Telecom::checkSellRate(0.025, null, 5));
        $this->assertSame('negative', Telecom::marginAlert(Telecom::margin(100, 120), 2));
        $this->assertSame('thin', Telecom::marginAlert(Telecom::margin(100, 99), 2));
        $this->assertEqualsWithDelta(0.0239, Telecom::priceFor(0.021, 12), 0.0001);
    }

    public function test_cycles_7_3_and_credit(): void
    {
        [$s, $e] = Telecom::cycleFor(CarbonImmutable::parse('2026-01-05'), 7, CarbonImmutable::parse('2026-11-18'));
        $this->assertSame(7, (int) $s->diffInDays($e));
        $this->assertSame([7, 3], Telecom::terms('7/3'));
        $this->assertSame([7, 4], Telecom::terms('7/4'));
        $this->assertSame('warning', Telecom::creditState(8000, 10000));
        $this->assertSame('over', Telecom::creditState(10000, 10000));
    }

    public function test_rate_sheet_parsing_aliases_errors_and_longest_prefix(): void
    {
        $r = Telecom::parseRateDeck([['Country', 'Dial Code', 'Price', 'Effective Date'], ['Nigeria Mobile', '234-80', '$0.0250', '2026-11-20'], ['Ghana', '233', 'abc', ''], ['Nigeria Mobile', '23480', '0.03', ''], ['UK', '44', '0.01', '']]);
        $this->assertCount(2, $r['rows']);
        $this->assertSame('23480', $r['rows'][0]['prefix']);
        $this->assertCount(2, $r['errors']);
        $best = Telecom::matchPrefix('+234 803 000 0000', [['prefix' => '234'], ['prefix' => '23480']]);
        $this->assertSame('23480', $best['prefix']);
        $cmp = Telecom::compareDecks([['prefix' => '1', 'rate' => 1], ['prefix' => '2', 'rate' => 1], ['prefix' => '3', 'rate' => 1]], [['prefix' => '1', 'rate' => 2], ['prefix' => '2', 'rate' => 0.5], ['prefix' => '4', 'rate' => 1]]);
        $this->assertSame(['increase' => ['1'], 'decrease' => ['2'], 'new' => ['4'], 'removed' => ['3']], $cmp);
        $this->assertSame("'=1+1", Telecom::csvCell('=1+1'));
    }

    public function test_money_vat_fx_and_runway(): void
    {
        $t = Money::invoiceTotals([['quantity' => 2, 'unit_price' => 100, 'vatable' => true], ['quantity' => 1, 'unit_price' => 50, 'vatable' => false]]);
        $this->assertEquals(250, $t['subtotal']);
        $this->assertEquals(15, $t['vat']);
        $this->assertEquals(265, $t['total']);
        $this->assertEquals(156000, Money::toNgn(100, 'USD', 1560));
        $this->assertEquals(5.0, Money::runwayMonths(10000000, 1000000, 3000000));
        $this->assertNull(Money::runwayMonths(1, 5, 1));
        $this->assertSame(10, Money::payoffMonths(10000, 0, 1000));
    }

    public function test_fx_two_source_rule_and_jump_guard(): void
    {
        $found = [['currency' => 'USD', 'sell' => 1560, 'source' => 'Nairametrics', 'published_on' => '2026-11-15'], ['currency' => 'USD', 'sell' => 1570, 'source' => 'BusinessDay', 'published_on' => '2026-11-15'], ['currency' => 'EUR', 'sell' => 1700, 'source' => 'Punch']];
        $v = Money::judgeRates($found, ['USD' => 1550], '2026-11-15');
        $this->assertTrue($v['USD']['accepted']);
        $this->assertEquals(1565, $v['USD']['rate']);
        $this->assertFalse($v['EUR']['accepted']);
        $this->assertFalse(Money::judgeRates($found, ['USD' => 1000], '2026-11-15')['USD']['accepted']);
    }

    public function test_pii_masking_before_ai(): void
    {
        $this->assertSame('mail [email] or call [phone]', Money::maskPii('mail a.b@x.com or call +234 803 123 4567'));
    }
}
