@extends('public.shell', ['title' => $q->number.' — Figuraid'])
@section('body')
<div class="card">
  <h1>{{ $q->kind === 'quote' ? 'Quote' : 'Invoice' }} {{ $q->number }}</h1>
  <p class="muted">{{ $q->unit->name }} · issued {{ $q->issue_date->format('j M Y') }} · {{ $q->kind === 'quote' ? 'valid until' : 'due' }} {{ $q->due_date->format('j M Y') }}</p>
  <p>For: <strong>{{ $q->carrier?->name ?? $q->contact?->display_name }}</strong></p>
  <table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>
  @foreach($q->lines as $l)<tr><td>{{ $l->description }}</td><td class="r">{{ rtrim(rtrim(number_format($l->quantity, 2), '0'), '.') }}</td><td class="r">{{ number_format($l->unit_price, 2) }}</td><td class="r">{{ number_format($l->amount, 2) }}</td></tr>@endforeach
  </tbody><tfoot>
  <tr><td colspan="3" class="r">Subtotal</td><td class="r">{{ $q->currency }} {{ number_format($q->subtotal, 2) }}</td></tr>
  <tr><td colspan="3" class="r">VAT 7.5%</td><td class="r">{{ number_format($q->vat, 2) }}</td></tr>
  <tr><th colspan="3" class="r">Total</th><th class="r">{{ $q->currency }} {{ number_format($q->total, 2) }}</th></tr></tfoot></table>
  @if($q->kind === 'quote' && ! $q->signed_at)
  <form method="post" action="{{ route('quote.sign', $q->public_token) }}" style="display:grid;gap:12px">@csrf
    <label for="sig">Type your full name to accept</label><input id="sig" name="signature_name" required maxlength="120">
    <label style="font-weight:400"><input type="checkbox" name="agree" value="1" required style="width:auto"> I accept this quote and Figuraid's <a href="/terms">Terms and Conditions</a>.</label>
    @error('signature_name')<p class="flash warn">{{ $message }}</p>@enderror
    <button class="btn" type="submit">Accept and sign</button></form>
  @elseif($q->signed_at)<p class="muted">Signed by {{ $q->signature_name }} on {{ $q->signed_at->format('j M Y H:i') }}.</p>@endif
</div>
@endsection
