@php($c = config('site.company'))
<footer class="site-footer on-light">
  <div class="wrap">
    <div class="footer-cols">
      <div style="display:grid;gap:14px;align-content:start;color:var(--ink)">
        <span class="brand-logo"><img src="/brand/logo-horizontal-96.png" alt="Figuraid Ltd" width="612" height="96"></span>
        <span class="brand-tagline">Innovate · Connect · Grow</span>
        <address style="font-style:normal;color:var(--ink-2);line-height:1.6">
          @foreach($c['address'] as $l)<span style="display:block">{{ $l }}</span>@endforeach
          <span style="display:block;margin-top:10px">Sales: <a href="mailto:{{ $c['email'] }}">{{ $c['email'] }}</a></span>
          <span style="display:block">General: <a href="mailto:{{ $c['info_email'] }}">{{ $c['info_email'] }}</a></span>
          <span style="display:block">NOC: <a href="mailto:{{ $c['noc_email'] }}">{{ $c['noc_email'] }}</a></span>
          @if($c['phone'])<a href="tel:{{ preg_replace('/\s/','',$c['phone']) }}" style="display:block">{{ $c['phone'] }}</a>@endif
        </address>
        @if($c['social'])<p style="display:flex;gap:14px">@foreach($c['social'] as $n => $u)<a href="{{ $u }}" target="_blank" rel="noopener">{{ $n }}</a>@endforeach</p>@endif
      </div>
      <div><h2>Services</h2><ul>@foreach(config('site.services') as $s)<li><a href="/#svc-{{ $s['key'] }}">{{ $s['name'] }}</a></li>@endforeach</ul></div>
      <div><h2>Company</h2><ul>
        <li><a href="/#coverage">Coverage</a></li><li><a href="/#industries">Industries</a></li><li><a href="/request">Request a service</a></li>
        <li><a href="/request?intent=sales">Talk to sales</a></li><li><a href="/app/login">Staff sign in</a></li><li><a href="/portal/login">Customer portal</a></li></ul></div>
      <div><h2>Our other businesses</h2><ul class="biz">
        @foreach(config('site.other_businesses') as [$n, $line, $href])
          <li><a href="{{ $href }}" @if(str_starts_with($href,'http')) target="_blank" rel="noopener" @endif>{{ $n }}</a><span>{{ $line }}</span></li>
        @endforeach</ul></div>
      <div><h2>Legal</h2><ul><li><a href="/terms">Terms and Conditions</a></li><li><a href="/privacy">Privacy Policy</a></li><li><a href="/privacy/request">Your data rights</a></li></ul></div>
    </div>
    <div class="footer-base"><p>Copyright © {{ now()->year }} {{ $c['name'] }}. All rights reserved.</p></div>
  </div>
</footer>
