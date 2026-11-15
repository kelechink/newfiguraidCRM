@extends('public.shell', ['title' => 'Set your password — Figuraid'])
@section('body')<div class="card"><h1>Set your password</h1><p class="muted">At least 10 characters with letters and numbers.</p>
<form method="post" style="display:grid;gap:12px">@csrf<label for="p">New password</label><input id="p" type="password" name="password" required autocomplete="new-password">
<label for="c">Repeat password</label><input id="c" type="password" name="password_confirmation" required autocomplete="new-password">
@error('password')<p class="flash warn">{{ $message }}</p>@enderror<button class="btn" type="submit">Save and sign in</button></form></div>@endsection
