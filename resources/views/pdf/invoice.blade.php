<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:DejaVu Sans,sans-serif;font-size:12px;color:#1d1d1f}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{padding:7px;border-bottom:1px solid #ddd;text-align:left}.r{text-align:right}.muted{color:#6e6e73}
</style></head><body>
@php($logo = 'data:image/png;base64,'.base64_encode(file_get_contents(public_path('brand/logo-horizontal-96.png'))))
<table style="margin:0"><tr><td style="border:0"><img src="{{ $logo }}" style="height:40px"><h1 style="margin-top:10px">{{ $q->kind === 'quote' ? 'Quote' : ($q->kind === 'credit' ? 'Credit note' : 'Invoice') }}</h1><p class="muted">{{ $q->number }}</p></td>
<td class="r" style="border:0"><strong>Figuraid Ltd — {{ $q->unit->name }}</strong><br>Kano House, 72 Ralph Shodeinde Street<br>Central Business District, Abuja<br>{{ config('site.company.billing_email') }}</td></tr></table>
<p><strong>Bill to:</strong> {{ $q->carrier?->name ?? $q->contact?->display_name }}<br>Issued {{ $q->issue_date->format('j M Y') }} · Due {{ $q->due_date->format('j M Y') }}</p>
<table><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Amount</th></tr>
@foreach($q->lines as $l)<tr><td>{{ $l->description }}</td><td class="r">{{ $l->quantity + 0 }}</td><td class="r">{{ number_format($l->unit_price, 4) }}</td><td class="r">{{ number_format($l->amount, 2) }}</td></tr>@endforeach
<tr><td colspan="3" class="r">Subtotal</td><td class="r">{{ $q->currency }} {{ number_format($q->subtotal, 2) }}</td></tr>
<tr><td colspan="3" class="r">VAT (7.5%)</td><td class="r">{{ number_format($q->vat, 2) }}</td></tr>
<tr><th colspan="3" class="r">Total</th><th class="r">{{ $q->currency }} {{ number_format($q->total, 2) }}</th></tr>
@if($q->currency !== 'NGN')<tr><td colspan="4" class="muted">Naira equivalent at ₦{{ number_format($q->fx_rate, 2) }} per {{ $q->currency }} on issue date: ₦{{ number_format($q->total * $q->fx_rate, 2) }}</td></tr>@endif
</table>
@if($q->notes)<p>{{ $q->notes }}</p>@endif
</body></html>
