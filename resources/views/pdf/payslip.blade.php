<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:DejaVu Sans,sans-serif;font-size:12px;color:#1d1d1f}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{padding:6px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}.muted{color:#6e6e73}.tot td{font-weight:bold;border-top:2px solid #1d1d1f}
</style></head><body>
@php($logo = 'data:image/png;base64,'.base64_encode(file_get_contents(public_path('brand/logo-horizontal-96.png'))))
<table style="margin:0"><tr><td style="border:0"><img src="{{ $logo }}" style="height:36px"><h1 style="margin-top:8px">Payslip</h1><p class="muted">{{ $month }}</p></td><td class="r" style="border:0"><strong>Figuraid Ltd</strong><br>Kano House, 72 Ralph Shodeinde Street<br>Central Business District, Abuja</td></tr></table>
<p><strong>{{ $user->name }}</strong> · {{ $user->staffProfile?->employee_no }} · {{ $user->staffProfile?->job_title }}@if(($b['pro_rata'] ?? 1) < 1) · paid for {{ round($b['pro_rata'] * 100) }}% of the month @endif</p>
<table><tr><th>Earnings</th><th class="r">₦</th></tr>
<tr><td>Basic</td><td class="r">{{ number_format($b['base'], 2) }}</td></tr>
@foreach($b['allowances'] as $a)<tr><td>{{ $a['name'] }}</td><td class="r">{{ number_format($a['amount'], 2) }}</td></tr>@endforeach
@foreach($b['bonuses'] as $a)<tr><td>{{ $a['name'] }}</td><td class="r">{{ number_format($a['amount'], 2) }}</td></tr>@endforeach
<tr class="tot"><td>Gross pay</td><td class="r">{{ number_format($b['gross'], 2) }}</td></tr></table>
<table><tr><th>Deductions</th><th class="r">₦</th></tr>
@foreach(array_merge($b['statutory'], $b['deductions']) as $d)<tr><td>{{ $d['name'] }}</td><td class="r">{{ number_format($d['amount'], 2) }}</td></tr>@endforeach
<tr class="tot"><td>Total deductions</td><td class="r">{{ number_format($b['total_deductions'], 2) }}</td></tr></table>
<table><tr class="tot"><td>NET PAY</td><td class="r">₦{{ number_format($b['net'], 2) }}</td></tr></table>
@if(! empty($b['employer']))<p class="muted">Paid by Figuraid on your behalf (not deducted): employer pension ₦{{ number_format($b['employer']['pension'], 2) }}.</p>@endif
<p class="muted">Attendance deductions are itemised under Team → Deductions. Questions: ask Amara (HR) in Team chat.</p>
</body></html>
