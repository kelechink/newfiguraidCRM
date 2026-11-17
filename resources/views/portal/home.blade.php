@extends('public.shell', ['title' => 'Customer portal — Figuraid'])
@push('head')<style>main{max-width:960px}.grid{display:grid;gap:16px}</style>@endpush
@section('body')
<div class="grid">
<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><h1>{{ $carrier?->name ?? $p->contact->display_name }}</h1>
<form method="post" action="{{ route('portal.logout') }}">@csrf<button class="btn" style="min-height:36px;padding:8px 14px" type="submit">Sign out</button></form></div>
@if($carrier)<p class="muted">Currency {{ $carrier->currency }} · Billing {{ $carrier->billing_cycle }} · Increments {{ $carrier->increment_first }}/{{ $carrier->increment_next }} · Credit limit {{ number_format($carrier->credit_limit, 2) }} · Prepaid balance {{ number_format($carrier->prepaid_balance, 2) }}</p>@endif
<p>Outstanding: <strong>{{ number_format($outstanding, 2) }}</strong></p>
<p class="muted" style="font-size:14px">Network issues: <a href="mailto:{{ config('site.company.noc_email') }}">{{ config('site.company.noc_email') }}</a> · Billing: <a href="mailto:{{ config('site.company.billing_email') }}">{{ config('site.company.billing_email') }}</a>@if($carrier) · Send rate sheets to <a href="mailto:{{ config('mailboxes.boxes.rates.address') }}">{{ config('mailboxes.boxes.rates.address') }}</a>@endif</p></div>
@if($carrier)
<div class="card"><h2>Your rates</h2><table><tr><th>Destination</th><th>Prefix</th><th class="r">Rate / min</th><th>From</th></tr>
@forelse($rates as $r)<tr><td>{{ $r->destination }}</td><td>{{ $r->prefix }}</td><td class="r">{{ number_format($r->rate, 5) }} {{ $r->currency }}</td><td>{{ $r->effective_from->format('j M Y') }}</td></tr>@empty<tr><td colspan="4">No active rates yet.</td></tr>@endforelse</table></div>
<div class="card"><h2>Usage, last 30 days</h2><table><tr><th>Destination</th><th class="r">Minutes</th><th class="r">Amount</th></tr>
@forelse($usage as $u)<tr><td>{{ $u->destination }}</td><td class="r">{{ number_format($u->minutes) }}</td><td class="r">{{ number_format($u->amount, 2) }}</td></tr>@empty<tr><td colspan="3">No traffic recorded.</td></tr>@endforelse</table></div>
<div class="card"><h2>Request a route</h2><form method="post" action="{{ route('portal.routes') }}" style="display:grid;gap:10px">@csrf
<input name="destination" placeholder="Destination, e.g. Kenya Mobile" required><input name="volume" placeholder="Expected volume"><input name="target_rate" type="number" step="0.00001" placeholder="Target rate (optional)"><button class="btn" type="submit">Send request</button></form>
@foreach($requests as $q)<p class="muted" style="font-size:14px">{{ $q->created_at->format('j M') }} · {{ $q->destination }} · {{ $q->status }}</p>@endforeach</div>
@else
<div class="card"><h2>Your services</h2><table><tr><th>Service</th><th>Renews</th><th class="r">Amount</th><th>Status</th></tr>
@forelse($services as $s)<tr><td>{{ $s->name }}</td><td>{{ $s->next_due_on->format('j M Y') }}</td><td class="r">{{ $s->currency }} {{ number_format($s->amount, 2) }}</td><td>{{ $s->status }}</td></tr>@empty<tr><td colspan="4">No services.</td></tr>@endforelse</table></div>
<div class="card"><h2>Support</h2><form method="post" action="{{ route('portal.tickets') }}" style="display:grid;gap:10px">@csrf<input name="subject" placeholder="Subject" required><textarea name="body" rows="4" placeholder="Describe the problem" required></textarea><button class="btn" type="submit">Open ticket</button></form>
@foreach($tickets as $t)<p class="muted" style="font-size:14px">{{ $t->number }} · {{ $t->subject }} · {{ $t->status }}</p>@endforeach</div>
@endif
<div class="card"><h2>Invoices</h2><table><tr><th>Number</th><th>Issued</th><th>Due</th><th class="r">Total</th><th>Status</th></tr>
@forelse($invoices as $i)<tr><td>@if($i->public_token)<a href="{{ route('quote.show', $i->public_token) }}">{{ $i->number }}</a>@else{{ $i->number }}@endif</td><td>{{ $i->issue_date->format('j M Y') }}</td><td>{{ $i->due_date->format('j M Y') }}</td><td class="r">{{ $i->currency }} {{ number_format($i->total, 2) }}</td><td>{{ str_replace('_', ' ', $i->status) }}</td></tr>@empty<tr><td colspan="5">No invoices.</td></tr>@endforelse</table></div>
</div>
@endsection
