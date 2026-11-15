@extends('public.shell', ['title' => 'Reset portal password — Figuraid'])
@section('body')<div class="card"><h1>Reset your password</h1>
<form method="post" style="display:grid;gap:12px">@csrf<label for="e">Email</label><input id="e" type="email" name="email" required><button class="btn" type="submit">Send reset link</button></form></div>@endsection
