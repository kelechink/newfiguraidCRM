@extends('site.layout')
@push('head')
<link rel="preload" as="image" href="/site/hero/d/001.webp" media="(min-width: 768px)" fetchpriority="high">
<link rel="preload" as="image" href="/site/hero/m/001.webp" media="(max-width: 767px)" fetchpriority="high">
@endpush
@section('content')
@php($services = config('site.services'))
<section class="hero" data-tone="dark" aria-labelledby="hero-title" data-mode="pending" id="hero">
  <div class="hero-sticky">
    <div class="hero-media" aria-hidden="true">
      <picture id="hero-still"><source media="(max-width: 767px)" srcset="/site/hero/m/001.webp"><img src="/site/hero/d/001.webp" alt="" width="1120" height="630" fetchpriority="high" decoding="async"></picture>
      <canvas id="hero-canvas" style="opacity:0"></canvas>
      <div class="hero-shade"></div>
    </div>
    <div class="hero-copy wrap" id="hero-copy">
      <h1 id="hero-title" class="t-display">{{ config('site.hero.title') }}</h1>
      <p class="t-lead">{{ config('site.hero.lead') }}</p>
      <div class="hero-actions">
        <a href="/#request" class="btn btn-signal">Request a service</a>
        <a href="/request?intent=sales" class="btn btn-ghost-dark">Talk to sales</a>
      </div>
    </div>
    <div class="hero-coda wrap" aria-hidden="true" id="hero-coda"><p>{{ config('site.hero.coda') }}</p></div>
    <div class="scroll-cue" aria-hidden="true" id="scroll-cue"></div>
  </div>
</section>

<section id="services" class="services on-light" data-tone="light" aria-labelledby="services-title" tabindex="-1">
  <div id="services-track" data-count="{{ count($services) }}">
    <div class="wrap section" id="services-panel">
      <div class="section-head" data-reveal>
        <h2 id="services-title" class="t-h2">What we carry</h2>
        <p class="t-lead muted">Voice, messages, numbers and data, over one interconnect and one contract.</p>
      </div>
      <div class="chapter-tabs" role="tablist" aria-label="Services" id="chapter-tabs" hidden>
        @foreach($services as $i => $s)<button type="button" role="tab" aria-selected="{{ $i === 0 ? 'true' : 'false' }}" aria-controls="svc-{{ $s['key'] }}" data-i="{{ $i }}">{{ $s['name'] }}</button>@endforeach
      </div>
      <div class="services-pin" id="services-pin">
        <div class="chapters">
          @foreach($services as $i => $s)
          <article id="svc-{{ $s['key'] }}" class="chapter" data-active="true" data-i="{{ $i }}">
            <div style="display:grid;gap:18px;align-content:start">
              <h3 class="chapter-name">{{ $s['name'] }}</h3>
              <p class="t-lead muted chapter-line">{{ $s['line'] }}</p>
            </div>
            <ul class="offerings" data-count="{{ count($s['offerings']) }}">
              @foreach($s['offerings'] as [$name, $detail])<li class="offering"><h4>{{ $name }}</h4><p class="muted" style="font-size:15.5px;line-height:1.5">{{ $detail }}</p></li>@endforeach
            </ul>
          </article>
          @endforeach
        </div>
      </div>
    </div>
  </div>
</section>

@php($regions = config('site.regions'))
@php($names = collect($services)->pluck('name', 'key'))
@php($dots = json_decode(file_get_contents(resource_path('world-dots.json')), true))
<section id="coverage" class="coverage section" data-tone="dark" aria-labelledby="coverage-title" tabindex="-1">
  <div class="coverage-video" aria-hidden="true" id="coverage-video"><img src="/site/coverage-poster.webp" alt="" loading="lazy" decoding="async"></div>
  <div class="wrap on-dark">
    <div class="section-head" data-reveal>
      <h2 id="coverage-title" class="t-h2">Wherever your customers are.</h2>
      <p class="t-lead muted">Choose a region to see what you can buy there today. Ask us about any destination you don't see.</p>
    </div>
    <div class="coverage-grid">
      <div style="display:grid;gap:32px;align-content:start">
        <div class="regions" role="group" aria-label="Regions">
          @foreach($regions as $i => $r)<button type="button" aria-pressed="{{ $i === 0 ? 'true' : 'false' }}" data-region="{{ $r['key'] }}">{{ $r['name'] }}</button>@endforeach
        </div>
        @foreach($regions as $i => $r)
        <div class="region-detail" aria-live="polite" data-region-detail="{{ $r['key'] }}" @if($i) hidden @endif>
          <h3 class="t-h3">{{ $r['name'] }}</h3>
          <ul>@foreach($r['services'] as $k)<li>{{ $names[$k] }}</li>@endforeach</ul>
        </div>
        @endforeach
      </div>
      <svg class="map" viewBox="0 0 1000 500" data-focus="false" role="img" aria-label="World map" id="map">
        @foreach($regions as $i => $r)<path d="{{ $dots[$r['key']] }}" data-on="{{ $i === 0 ? 'true' : 'false' }}" data-region="{{ $r['key'] }}"/>@endforeach
      </svg>
    </div>
  </div>
</section>

<section id="industries" class="section on-light" data-tone="light" aria-labelledby="industries-title" tabindex="-1">
  <div class="wrap">
    <div class="section-head" data-reveal>
      <h2 id="industries-title" class="t-h2">Who we work with</h2>
      <p class="t-lead muted">Networks and businesses that need their calls, messages and data to arrive.</p>
    </div>
    @php($icons = ['M4.9 16.1C1 12.2 1 5.8 4.9 1.9M7.8 4.7a6.14 6.14 0 0 0 0 8.5M16.2 4.8c2 2 2.26 5.11.8 7.47M19.1 1.9a10 10 0 0 1 0 14.1M9.5 18h5M8 22l4-11 4 11', 'M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z', 'M3 4h18v16H3zM3 9h18M7 6.5h.01M10 6.5h.01', 'M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zm0 0a9 9 0 0 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2zM21 16v2a4 4 0 0 1-4 4h-5', 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18zM6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4', 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'])
    <ul class="industries-grid">
      @foreach(config('site.industries') as $i => [$n, $line])
      <li class="industry"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="{{ $icons[$i % 6] }}"/></svg><h3 class="t-h3">{{ $n }}</h3><p class="muted">{{ $line }}</p></li>
      @endforeach
    </ul>
  </div>
</section>

@if(count(config('site.insights')))
<section id="insights" class="section on-light" data-tone="light"><div class="wrap"><div class="section-head"><h2 class="t-h2">Insights</h2></div>
  <ul class="industries-grid">@foreach(config('site.insights') as $p)<li class="industry"><h3 class="t-h3"><a href="{{ $p['href'] }}">{{ $p['title'] }}</a></h3><p class="muted">{{ $p['summary'] }}</p></li>@endforeach</ul></div></section>
@endif

<section id="request" class="request section on-light" data-tone="light" aria-labelledby="request-title" tabindex="-1">
  <div class="wrap request-grid">
    <div class="section-head" data-reveal style="align-content:start;margin-bottom:0">
      <h2 id="request-title" class="t-h2">Tell us what you need.</h2>
      <p class="t-lead muted">Share the service, the destinations and your expected volume. Our telecom team will come back to you with rates and next steps.</p>
      <address class="muted" style="font-style:normal;margin-top:16px;line-height:1.6"><span style="display:block;color:var(--ink);font-weight:560">{{ config('site.company.name') }}</span>@foreach(config('site.company.address') as $l)<span style="display:block">{{ $l }}</span>@endforeach</address>
    </div>
    <div class="form-card">@include('site.partials.request-form', ['preset' => null])</div>
  </div>
</section>
@endsection
