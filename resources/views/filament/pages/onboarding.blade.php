<x-filament-panels::page>
<style>.ob-doc{border:1px solid rgba(127,127,127,.25);border-radius:14px;padding:18px;max-height:340px;overflow:auto;white-space:pre-wrap;line-height:1.6;font-size:14.5px}.ob-in{width:100%;border-radius:10px;border:1px solid rgba(127,127,127,.35);padding:10px 12px;background:transparent}</style>
@if($signed)
  <x-filament::section>You signed your contract pack on {{ $signed->format('j F Y, H:i') }}.</x-filament::section>
@else
  <p>Please read each document, then sign below. Work modules open as soon as you sign.</p>
  @forelse($templates as $t)
    <x-filament::section :heading="$t->title.' (v'.$t->version.')'" collapsible><div class="ob-doc">{{ $t->rendered }}</div></x-filament::section>
  @empty
    <x-filament::section>HR has not published the contract templates yet. You can still accept the attendance rules and privacy policy below.</x-filament::section>
  @endforelse
  <x-filament::section heading="Attendance rules">
    Work is Monday to Friday, 09:00 to 17:00 at Kano House. Any clock-in after 09:00 is late (₦500). Signing off before 17:00 is ₦500. Absence without approved leave or excuse is ₦3,000 per day. A missed clock-out is a no-show and is charged as an absence. Clock-ins away from the office do not count unless a manager approves them.
  </x-filament::section>
  <x-filament::section heading="Sign">
    <form wire:submit="sign" style="display:grid;gap:12px;max-width:520px">
      <label>Type your full name: <strong>{{ auth()->user()->name }}</strong><input class="ob-in" wire:model="signature" autocomplete="name"></label>
      @error('signature')<p style="color:#dc2626">{{ $message }}</p>@enderror
      <label><input type="checkbox" wire:model="agreeContract"> I have read and agree to the documents above and the attendance rules.</label>
      <label><input type="checkbox" wire:model="agreePrivacy"> I accept the internal privacy and acceptable-use policy (I will not share customer, payroll or carrier data outside approved systems).</label>
      @error('agreeContract')<p style="color:#dc2626">Please tick to agree.</p>@enderror
      <div><x-filament::button type="submit">Sign and continue</x-filament::button></div>
    </form>
  </x-filament::section>
@endif
</x-filament-panels::page>
