<x-filament-panels::page>
<style>.ps-t{width:100%;border-collapse:collapse;font-size:14px}.ps-t td,.ps-t th{padding:10px 8px;border-bottom:1px solid rgba(127,127,127,.18);text-align:left}.ps-t .r{text-align:right;font-variant-numeric:tabular-nums}</style>
<x-filament::section>
  <table class="ps-t"><tr><th>Month</th><th class="r">Gross</th><th class="r">Deductions</th><th class="r">Net pay</th><th></th></tr>
  @forelse($slips as $s)@php($b = $s->breakdown)
    <tr><td>{{ \Carbon\Carbon::parse($s->payrollRun->period_month.'-01')->format('F Y') }}</td><td class="r">₦{{ number_format($b['gross'], 2) }}</td><td class="r">₦{{ number_format($b['total_deductions'], 2) }}</td><td class="r"><strong>₦{{ number_format($b['net'], 2) }}</strong></td>
    <td><x-filament::button size="xs" tag="a" href="{{ route('payslip.pdf', $s) }}">Download PDF</x-filament::button></td></tr>
  @empty <tr><td colspan="5">No payslips yet. They appear here once payroll is signed off.</td></tr> @endforelse</table>
</x-filament::section>
</x-filament-panels::page>
