@php($n = fn ($v) => \App\Filament\Widgets\Metrics::ngn($v))
<x-filament-panels::page>
<style>
.fos-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
.fos-card{border-radius:14px;padding:18px;background:#fff;border:1px solid rgba(0,0,0,.07)}
.dark .fos-card{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08)}
.fos-k{font-size:13px;opacity:.7}.fos-v{font-size:26px;font-weight:650;letter-spacing:-.02em;margin-top:4px;font-variant-numeric:tabular-nums}
.fos-t{width:100%;border-collapse:collapse;font-size:14px}.fos-t th,.fos-t td{padding:10px 8px;border-bottom:1px solid rgba(127,127,127,.18);text-align:left}.fos-t .r{text-align:right;font-variant-numeric:tabular-nums}
.fos-bar{height:8px;border-radius:4px;background:#0b6f9e}.fos-neg{color:#dc2626}
</style>
<div style="display:flex;gap:8px">
  @foreach(['month' => 'This month', 'quarter' => 'This quarter', 'year' => 'This year'] as $k => $l)
    <x-filament::button size="sm" :color="$period === $k ? 'primary' : 'gray'" wire:click="$set('period', '{{ $k }}')">{{ $l }}</x-filament::button>
  @endforeach
</div>
<div class="fos-grid">
  @foreach(['Income' => $income, 'Expenditure' => $expenses, 'Profit / loss' => $profit, 'Salaries (approved payroll)' => $salaries, 'Cash position' => $cash, 'Owed to us' => $receivable, 'We owe (30 days)' => $payables, 'Debt outstanding' => $debt] as $k => $v)
    <div class="fos-card"><div class="fos-k">{{ $k }}</div><div class="fos-v {{ $v < 0 ? 'fos-neg' : '' }}">{{ $n($v) }}</div></div>
  @endforeach
  <div class="fos-card"><div class="fos-k">Months of runway</div><div class="fos-v">{{ $runway === null ? 'Not burning' : $runway }}</div></div>
</div>
<div class="fos-grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
  <div class="fos-card"><h3 style="font-weight:600;margin-bottom:8px">Cash forecast (expected case)</h3>
    <table class="fos-t">@foreach($forecast as $k => $v)<tr><td>{{ $k }}</td><td class="r {{ $v < 0 ? 'fos-neg' : '' }}">{{ $n($v) }}</td></tr>@endforeach</table>
    <p class="fos-k" style="margin-top:8px">Open invoices weighted by likelihood, our subscriptions, loan instalments and average monthly spend.</p></div>
  <div class="fos-card"><h3 style="font-weight:600;margin-bottom:8px">Profit by unit</h3>
    <table class="fos-t"><tr><th>Unit</th><th class="r">In</th><th class="r">Out</th><th class="r">Profit</th></tr>
    @foreach($byUnit as $u)<tr><td>{{ $u['name'] }}</td><td class="r">{{ $n($u['in']) }}</td><td class="r">{{ $n($u['out']) }}</td><td class="r {{ $u['in'] - $u['out'] < 0 ? 'fos-neg' : '' }}">{{ $n($u['in'] - $u['out']) }}</td></tr>@endforeach</table></div>
</div>
<div class="fos-card"><h3 style="font-weight:600;margin-bottom:8px">Debt tracker</h3>
  <table class="fos-t"><tr><th>Lender</th><th class="r">Original</th><th class="r">Outstanding</th><th class="r">Interest</th><th>Next payment</th><th class="r">Paid off in</th><th style="width:20%">Progress</th></tr>
  @forelse($debts as $row)@php($d = $row['d'])
    <tr><td>{{ $d->lender }}</td><td class="r">{{ $n($d->principal) }}</td><td class="r">{{ $n($d->outstanding) }}</td><td class="r">{{ $d->interest_rate_pct }}%</td><td>{{ $d->next_payment_on?->format('j M Y') ?? '—' }} @if($d->instalment)· {{ $n($d->instalment) }}@endif</td>
    <td class="r">{{ $row['months'] === null ? 'Instalment too low' : $row['months'].' months' }}</td>
    <td><div style="background:rgba(127,127,127,.2);border-radius:4px"><div class="fos-bar" style="width:{{ $d->principal > 0 ? max(2, min(100, round((1 - $d->outstanding / $d->principal) * 100))) : 0 }}%"></div></div></td></tr>
  @empty<tr><td colspan="7">No debts recorded.</td></tr>@endforelse</table></div>
</x-filament-panels::page>
