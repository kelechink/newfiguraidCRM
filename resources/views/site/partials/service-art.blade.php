{{-- Living line-art scenes for each service group. Pure SVG + CSS: animations run only while the scene is on screen
     (data-scene → .is-live), lines draw themselves in once, and reduced-motion visitors get the finished still. --}}
<figure class="svc-art" data-scene aria-hidden="true">
@switch($key)
@case('voice')
<svg viewBox="0 0 480 200" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <path class="draw" pathLength="1" d="M10 182H470"/>
  <g class="draw-g">
    <path class="draw" pathLength="1" d="M74 182L96 64L118 182M82 140H110M87 112H105M92 86H100"/>
    <path class="draw" pathLength="1" d="M362 182L384 64L406 182M370 140H398M375 112H393M380 86H388"/>
  </g>
  <circle class="ring" cx="96" cy="58" r="10"/><circle class="ring d2" cx="96" cy="58" r="10"/>
  <circle class="ring d3" cx="384" cy="58" r="10"/><circle class="ring d4" cx="384" cy="58" r="10"/>
  <path class="route" d="M104 56C180 -4 300 -4 376 56"/>
  <path class="flow accent" d="M104 56C180 -4 300 -4 376 56"/>
  <g class="eq" transform="translate(192 120)">
    @foreach([18, 34, 26, 44, 30, 40, 22, 36, 16] as $i => $h)<rect class="bar" style="--i:{{ $i }}" x="{{ $i * 12 }}" y="{{ 50 - $h }}" width="6" height="{{ $h }}" rx="3"/>@endforeach
  </g>
</svg>
@break
@case('messaging')
<svg viewBox="0 0 480 200" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <path class="draw" pathLength="1" d="M10 182H470"/>
  <rect class="draw" pathLength="1" x="300" y="22" width="96" height="160" rx="16"/>
  <path class="draw" pathLength="1" d="M336 34H360"/>
  <g class="otp">@foreach(['4', '8', '2', '9'] as $i => $d)<text class="digit" style="--i:{{ $i }}" x="{{ 318 + $i * 17 }}" y="150" font-size="18" font-family="Inter, sans-serif" fill="currentColor" stroke="none">{{ $d }}</text>@endforeach</g>
  <g class="bubbles">
    <path class="bubble b1" d="M314 60H372A8 8 0 0 1 380 68V80A8 8 0 0 1 372 88H326L316 96V68A8 8 0 0 1 314 60Z"/>
    <path class="bubble b2" d="M314 98H372A8 8 0 0 1 380 106V118A8 8 0 0 1 372 126H326L316 134V106A8 8 0 0 1 314 98Z"/>
  </g>
  <path class="route" d="M40 120C120 120 180 70 300 70"/><path class="flow accent" d="M40 120C120 120 180 70 300 70"/>
  <path class="route" d="M40 150C140 150 200 110 300 110"/><path class="flow accent d2" d="M40 150C140 150 200 110 300 110"/>
  <rect class="draw" pathLength="1" x="20" y="104" width="40" height="64" rx="6"/>
  <path class="draw" pathLength="1" d="M28 118H52M28 130H52M28 142H44"/>
  <path class="check" pathLength="1" d="M410 70L420 80L440 58"/>
</svg>
@break
@case('numbers')
<svg viewBox="0 0 480 200" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <path class="draw" pathLength="1" d="M10 182H470"/>
  <g class="tiles">
    @foreach(['+234', '+44', '+1', '+233', '+254', '+971'] as $i => $n)
      <g class="tile" style="--i:{{ $i }}" transform="translate({{ 20 + ($i % 3) * 74 }} {{ 30 + intdiv($i, 3) * 60 }})"><rect width="64" height="44" rx="10"/><text x="32" y="28" text-anchor="middle" font-size="14" font-family="Inter, sans-serif" fill="currentColor" stroke="none">{{ $n }}</text></g>
    @endforeach
  </g>
  <rect class="draw" pathLength="1" x="270" y="26" width="190" height="130" rx="12"/>
  <path class="draw" pathLength="1" d="M270 48H460"/>
  <circle cx="284" cy="37" r="3"/><circle cx="296" cy="37" r="3"/><circle cx="308" cy="37" r="3"/>
  @foreach([[290, 70, 120], [306, 90, 96], [306, 110, 132], [290, 130, 72]] as $i => [$x, $y, $w])<rect class="code" style="--i:{{ $i }}" x="{{ $x }}" y="{{ $y - 5 }}" width="{{ $w }}" height="6" rx="3" fill="currentColor" stroke="none"/>@endforeach
  <rect class="cursor accent-fill" x="366" y="125" width="2" height="12" stroke="none"/>
  <path class="route" d="M240 90H270"/><path class="flow accent" d="M240 90H270"/>
</svg>
@break
@default
<svg viewBox="0 0 480 200" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
  <path class="draw" pathLength="1" d="M10 182H470"/>
  <path class="draw" pathLength="1" d="M218 182L240 70L262 182M226 140H254M231 110H249M236 86H244"/>
  <circle class="ring" cx="240" cy="62" r="12"/><circle class="ring d2" cx="240" cy="62" r="12"/><circle class="ring d3" cx="240" cy="62" r="12"/>
  <g class="truck"><path d="M0 0H40V-22H0ZM40 -14H54L60 -6V0H40" /><circle cx="12" cy="4" r="5"/><circle cx="48" cy="4" r="5"/></g>
  <rect class="draw" pathLength="1" x="380" y="96" width="70" height="86" rx="6"/>
  @foreach([112, 132, 152] as $i => $y)<path d="M390 {{ $y }}H430"/><circle class="led" style="--i:{{ $i }}" cx="440" cy="{{ $y }}" r="3" fill="currentColor" stroke="none"/>@endforeach
  <path class="route" d="M250 76C300 60 350 80 380 110"/><path class="flow accent" d="M250 76C300 60 350 80 380 110"/>
  <path class="route" d="M230 76C180 60 120 90 90 150"/><path class="flow accent d2" d="M230 76C180 60 120 90 90 150"/>
  <rect class="draw" pathLength="1" x="70" y="150" width="40" height="32" rx="4"/><path d="M80 166H100"/>
</svg>
@endswitch
</figure>
