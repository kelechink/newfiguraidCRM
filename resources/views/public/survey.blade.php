@extends('public.shell', ['title' => 'Your feedback — Figuraid'])
@section('body')
<div class="card">
@if($s->answered_at)<h1>Thank you</h1><p class="muted">We've received your feedback.</p>
@else
  <h1>{{ $s->kind === 'nps' ? 'How likely are you to recommend us to a colleague?' : 'How satisfied are you with our help?' }}</h1>
  <form method="post" style="display:grid;gap:12px">@csrf
    <label for="score">{{ $s->kind === 'nps' ? '0 = not at all, 10 = extremely likely' : '1 = very unhappy, 5 = very happy' }}</label>
    <select id="score" name="score" required>@foreach(range($s->kind === 'nps' ? 0 : 1, $s->kind === 'nps' ? 10 : 5) as $n)<option>{{ $n }}</option>@endforeach</select>
    <label for="comment">Anything we should know? (optional)</label><textarea id="comment" name="comment" rows="4"></textarea>
    <button class="btn" type="submit">Send</button></form>
@endif
</div>
@endsection
