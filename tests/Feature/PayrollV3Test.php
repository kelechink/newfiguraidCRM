<?php

namespace Tests\Feature;

use App\Models\PayrollRun;
use App\Models\Payslip;
use App\Models\TaxRecord;
use App\Models\User;
use App\Services\PayrollService;
use Database\Seeders\CoreSeeder;
use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PayrollV3Test extends TestCase
{
    use RefreshDatabase;

    public function test_employer_costs_remittances_and_payslip_access(): void
    {
        $this->seed([CoreSeeder::class, DemoSeeder::class]);
        $fin = User::where('email', 'finance@figuraid.test')->first();
        $run = PayrollRun::forceCreate(['period_month' => now()->format('Y-m'), 'prepared_by_id' => $fin->id, 'status' => 'draft']);
        $svc = app(PayrollService::class);
        $svc->prepare($run);
        $run->refresh();
        $e = $run->employer_costs;
        $this->assertGreaterThan(0, $e['pension']);
        $this->assertEqualsWithDelta((float) $run->total_gross * 0.01, $e['nsitf'], 0.05);
        $this->assertGreaterThan((float) $run->total_gross, $e['total_employer_cost']);
        $this->assertNotSame((string) $e['pension'], \DB::table('payroll_runs')->where('id', $run->id)->value('employer_costs')); // encrypted at rest

        $svc->approve($run, User::where('email', 'admin@figuraid.test')->first());
        $this->assertTrue(TaxRecord::where('period_month', $run->period_month)->where('kind', 'nsitf')->exists());
        $this->assertTrue(TaxRecord::where('period_month', $run->period_month)->where('kind', 'paye')->exists());

        $staff = User::where('email', 'staff@figuraid.test')->first();
        $slip = Payslip::where('payroll_run_id', $run->id)->where('user_id', $staff->id)->first();
        $this->actingAs($staff)->get(route('payslip.pdf', $slip))->assertForbidden(); // not signed off yet
        $svc->signOff($run->fresh(), User::where('email', 'founder@figuraid.test')->first());
        $this->get(route('payslip.pdf', $slip))->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $other = Payslip::where('payroll_run_id', $run->id)->where('user_id', '!=', $staff->id)->first();
        $this->get(route('payslip.pdf', $other))->assertForbidden();
        $this->get('/app/my-payslips')->assertOk()->assertSee('Download PDF');
    }
}
