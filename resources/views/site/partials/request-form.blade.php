@php($options = array_merge(collect(config('site.services'))->flatMap(fn ($g) => collect($g['offerings'])->pluck(0))->reject(fn ($n) => $n === 'Route quality reporting')->values()->all(), config('site.extra_requestable')))
@if(session('request_sent'))
  <div class="form-done" role="status"><h3 class="t-h3">Request sent.</h3><p class="muted">Our team will reply with rates and next steps. We've emailed you a copy of what you sent.</p><a class="btn btn-ghost" href="/request">Send another request</a></div>
@else
<form class="form-grid" method="post" action="{{ route('request.submit') }}" novalidate>
  @csrf
  @foreach(['utm_source','utm_medium','utm_campaign','utm_content'] as $u)<input type="hidden" name="{{ $u }}" value="{{ request($u) }}">@endforeach
  <div class="field full">
    <label for="rq-service">Service</label>
    <select id="rq-service" name="service" required @error('service') aria-invalid="true" aria-describedby="service-error" @enderror>
      <option value="" disabled @selected(! old('service', $preset ?? request('service')))>Choose a service</option>
      @foreach($options as $o)<option @selected(old('service', $preset ?? request('service')) === $o)>{{ $o }}</option>@endforeach
    </select>
    @error('service')<p id="service-error" class="error">{{ $message }}</p>@enderror
  </div>
  <div class="field"><label for="rq-dest">Destinations</label><input id="rq-dest" name="destinations" value="{{ old('destinations') }}" placeholder="e.g. Nigeria, Ghana, UK" autocomplete="off"></div>
  <div class="field"><label for="rq-vol">Expected monthly volume</label><input id="rq-vol" name="volume" value="{{ old('volume') }}" placeholder="e.g. 2 million minutes" autocomplete="off"></div>
  @foreach([['name','Full name','name','text'],['company','Company','organization','text'],['email','Work email','email','email']] as [$f,$label,$ac,$type])
  <div class="field"><label for="rq-{{ $f }}">{{ $label }}</label><input id="rq-{{ $f }}" name="{{ $f }}" type="{{ $type }}" value="{{ old($f) }}" autocomplete="{{ $ac }}" required @error($f) aria-invalid="true" aria-describedby="{{ $f }}-error" @enderror>@error($f)<p id="{{ $f }}-error" class="error">{{ $message }}</p>@enderror</div>
  @endforeach
  <div class="field"><label for="rq-phone">Phone <span class="hint">(optional)</span></label><input id="rq-phone" name="phone" type="tel" inputmode="tel" value="{{ old('phone') }}" autocomplete="tel"></div>
  <div class="field full"><label for="rq-msg">Anything else <span class="hint">(optional)</span></label><textarea id="rq-msg" name="message" rows="4">{{ old('message') }}</textarea></div>
  <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">
  <label class="consent full"><input type="checkbox" name="marketing" @checked(old('marketing'))><span>Send me product updates and route offers by email. You can unsubscribe at any time.</span></label>
  @if(config('services.turnstile.site_key'))
    <div class="full"><script nonce="{{ app('csp-nonce') }}" src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script><div class="cf-turnstile" data-sitekey="{{ config('services.turnstile.site_key') }}"></div></div>
  @endif
  @error('form')<p id="form-error" class="form-status full" data-tone="error" role="alert">{{ $message }}</p>@enderror
  <div class="full" style="display:grid;gap:14px;justify-items:start">
    <button type="submit" class="btn btn-ink">Send request</button>
    <p class="legal-note">By submitting, you agree to our <a href="/terms">Terms and Conditions</a> and <a href="/privacy">Privacy Policy</a>.</p>
  </div>
</form>
@endif
