<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{{ $title ?? 'Figuraid — Global wholesale telecom' }}</title>
<meta name="description" content="{{ $description ?? config('site.hero.lead') }}">
<meta property="og:title" content="Figuraid — The world, connected.">
<meta property="og:description" content="{{ config('site.hero.lead') }}">
<meta property="og:image" content="{{ url('/brand/og.png') }}">
<meta name="theme-color" content="#021e52">
<link rel="canonical" href="{{ url()->current() }}">
<link rel="icon" href="/brand/icon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/brand/icon-180.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..700&display=swap">
<link rel="stylesheet" href="/site/site.css?v={{ filemtime(public_path('site/site.css')) }}">
@stack('head')
</head>
<body>
<div class="site">
  <a href="#main" class="skip-link">Skip to content</a>
  @include('site.partials.header')
  <main id="main" tabindex="-1">@yield('content')</main>
  @include('site.partials.footer')
  @include('site.partials.assistant')
</div>
<script nonce="{{ app('csp-nonce') }}" src="/site/js/gsap.min.js"></script>
<script nonce="{{ app('csp-nonce') }}" src="/site/js/ScrollTrigger.min.js"></script>
<script nonce="{{ app('csp-nonce') }}" src="/site/js/lenis.min.js"></script>
<script nonce="{{ app('csp-nonce') }}" src="/site/js/site.js?v={{ filemtime(public_path('site/js/site.js')) }}"></script>
@stack('scripts')
</body>
</html>
