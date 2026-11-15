@extends('site.layout', ['title' => 'Request a service — Figuraid'])
@section('content')
<section id="request" class="request section on-light" data-tone="light" aria-labelledby="request-title" style="padding-top:120px">
  <div class="wrap request-grid">
    <div class="section-head" style="align-content:start;margin-bottom:0">
      <h1 id="request-title" class="t-h2">{{ request('intent') === 'sales' ? 'Talk to sales.' : 'Tell us what you need.' }}</h1>
      <p class="t-lead muted">Share the service, the destinations and your expected volume. Our team will come back to you with rates and next steps.</p>
      <address class="muted" style="font-style:normal;margin-top:16px;line-height:1.6"><span style="display:block;color:var(--ink);font-weight:560">{{ config('site.company.name') }}</span>@foreach(config('site.company.address') as $l)<span style="display:block">{{ $l }}</span>@endforeach</address>
    </div>
    <div class="form-card">@include('site.partials.request-form', ['preset' => $preset])</div>
  </div>
</section>
@endsection
