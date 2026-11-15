@extends('public.shell', ['title' => 'Clock in — Figuraid'])
@section('body')
<div class="card">
  <h1>{{ $next === 'in' ? 'Clock in' : 'Clock out' }}</h1>
  <p class="muted">{{ $u->name }} · {{ now('Africa/Lagos')->format('l j F, H:i') }} · Work hours 09:00–17:00 at Kano House.</p>
  @if($day)<p>Today: <strong>{{ str_replace('_',' ', $day->status) }}</strong>@if($day->first_in_at) · in {{ $day->first_in_at->timezone('Africa/Lagos')->format('H:i') }}@endif @if($day->last_out_at) · out {{ $day->last_out_at->timezone('Africa/Lagos')->format('H:i') }}@endif</p>@endif
  <form method="post" action="{{ route('clock.punch') }}" enctype="multipart/form-data" id="clock-form" style="display:grid;gap:14px">
    @csrf
    <input type="hidden" name="type" value="{{ $next }}"><input type="hidden" name="lat"><input type="hidden" name="lng"><input type="hidden" name="accuracy"><input type="hidden" name="device"><input type="hidden" name="device_ts">
    <label for="selfie">Selfie</label>
    <input id="selfie" type="file" name="selfie" accept="image/*" capture="user" required>
    <p class="muted" id="gps">Getting your location…</p>
    @error('selfie')<p class="flash warn">{{ $message }}</p>@enderror
    <button class="btn big" type="submit">{{ $next === 'in' ? 'Clock in now' : 'Clock out now' }}</button>
  </form>
  <p class="muted" style="font-size:13px">Late after 09:00 (₦500), leaving before 17:00 (₦500), absent without approved leave (₦3,000), missed clock-out counts as a no-show. Punches away from the office only count if a manager approves them.</p>
  <p><a href="/app">Open Figuraid OS</a></p>
</div>
@endsection
@push('scripts')
<script nonce="{{ app('csp-nonce') }}">
(() => {
  const f = document.getElementById('clock-form'), gps = document.getElementById('gps');
  let id = localStorage.getItem('fos.device'); if (!id) { id = crypto.randomUUID(); localStorage.setItem('fos.device', id); }
  f.device.value = id;
  if (!navigator.geolocation) { gps.textContent = 'Location is not available on this phone.'; return; }
  navigator.geolocation.watchPosition((p) => {
    f.lat.value = p.coords.latitude; f.lng.value = p.coords.longitude; f.accuracy.value = Math.round(p.coords.accuracy);
    gps.textContent = 'Location ready (±' + Math.round(p.coords.accuracy) + ' m).';
  }, (e) => { gps.textContent = 'Please allow location access: ' + e.message; }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  f.addEventListener('submit', () => { f.device_ts.value = Date.now(); });
})();
</script>
@endpush
