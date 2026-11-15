@extends('public.shell', ['title' => 'Book a call with '.$user->name])
@section('body')
<div class="card">
  <h1>Book a call with {{ $user->name }}</h1><p class="muted">30 minutes, Lagos time (WAT).</p>
  <form method="post" style="display:grid;gap:12px">@csrf
    <label for="t">Time</label><select id="t" name="starts_at" required>@foreach($slots as $day => $list)<optgroup label="{{ $day }}">@foreach($list as $s)<option value="{{ $s->toDateTimeString() }}">{{ $s->format('H:i') }}</option>@endforeach</optgroup>@endforeach</select>
    <label for="n">Name</label><input id="n" name="name" required><label for="e">Email</label><input id="e" type="email" name="email" required>
    <label for="no">What would you like to discuss?</label><textarea id="no" name="notes" rows="3"></textarea>
    <p class="muted" style="font-size:13px">By submitting, you agree to our <a href="/terms">Terms and Conditions</a> and <a href="/privacy">Privacy Policy</a>.</p>
    <button class="btn" type="submit">Book</button></form>
</div>
@endsection
