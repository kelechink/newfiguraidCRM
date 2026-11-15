@extends('public.shell', ['title' => 'Your data rights — Figuraid'])
@section('body')
<div class="card">
@isset($verified)
  <h1>{{ $verified ? 'Request confirmed' : 'Link not valid' }}</h1>
  <p class="muted">{{ $verified ? 'Thank you. Our team will respond within 30 days.' : 'This link has expired or was already used. Please submit the request again.' }}</p>
@else
  <h1>Your data rights</h1>
  <p class="muted">Under the Nigeria Data Protection Act 2023 you can ask to see, correct or delete the personal data Figuraid holds about you, object to its use, or withdraw consent. We confirm requests by email and reply within 30 days.</p>
  <form method="post" style="display:grid;gap:12px">@csrf
    <label for="k">What would you like?</label>
    <select id="k" name="kind" required><option value="access">A copy of my data</option><option value="correct">Correct my data</option><option value="delete">Delete my data</option><option value="object">Stop using my data for marketing</option><option value="withdraw">Withdraw my consent</option></select>
    <label for="n">Full name</label><input id="n" name="name" required>
    <label for="e">Email we know you by</label><input id="e" type="email" name="email" required>
    <label for="d">Details (optional)</label><textarea id="d" name="details" rows="3"></textarea>
    @if(config('services.turnstile.site_key'))<script nonce="{{ app('csp-nonce') }}" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script><div class="cf-turnstile" data-sitekey="{{ config('services.turnstile.site_key') }}"></div>@endif
    <button class="btn" type="submit">Send request</button>
  </form>
@endisset
</div>
@endsection
