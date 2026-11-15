@extends('public.shell', ['title' => 'Customer portal — Figuraid'])
@section('body')
<div class="card"><h1>Customer portal</h1><p class="muted">Rates, invoices, usage and support for Figuraid customers.</p>
<form method="post" action="/portal/login" style="display:grid;gap:12px">@csrf
<label for="e">Email</label><input id="e" type="email" name="email" value="{{ old('email') }}" required autocomplete="email">
<label for="p">Password</label><input id="p" type="password" name="password" required autocomplete="current-password">
@error('email')<p class="flash warn">{{ $message }}</p>@enderror
<button class="btn" type="submit">Sign in</button></form>
<p class="muted" style="font-size:13px">No account yet? Ask your Figuraid account manager to invite you.</p></div>
@endsection
