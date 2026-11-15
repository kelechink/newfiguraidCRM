@extends('public.shell', ['title' => 'Certificate check — Figure Academy'])
@section('body')
<div class="card">
@if($e)
  <h1>Certificate verified</h1>
  <p><strong>{{ $e->contact->display_name }}</strong> completed <strong>{{ $e->cohort->course->title }}</strong> ({{ $e->cohort->name }}) at Figure Academy.</p>
  <p class="muted">Certificate {{ $e->certificate_code }} · issued {{ $e->certificate_issued_at->format('j F Y') }}</p>
@else
  <h1>Not found</h1><p class="muted">No certificate matches “{{ $code }}”. Check the code and try again.</p>
@endif
</div>
@endsection
