<x-filament-panels::page>
<style>.st-in{width:100%;border-radius:10px;border:1px solid rgba(127,127,127,.35);padding:9px 12px;background:transparent}.st-g{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}.st-t{width:100%;border-collapse:collapse;font-size:14px}.st-t td,.st-t th{padding:8px;border-bottom:1px solid rgba(127,127,127,.2);text-align:left}</style>
<form wire:submit="save" style="display:grid;gap:20px">
  <x-filament::section heading="Business rules">
    <div class="st-g">
    @foreach(\App\Filament\Pages\Settings::KEYS as $k => $def)
      @php($f = str_replace('.', '__', $k))
      <label style="display:grid;gap:6px;font-size:14px">{{ $def[0] }}
        @if($def[1] === 'select')<select class="st-in" wire:model="s.{{ $f }}">@foreach($def[2] as $v => $l)<option value="{{ $v }}">{{ $l }}</option>@endforeach</select>
        @elseif($def[1] === 'bool')<input type="checkbox" wire:model="s.{{ $f }}">
        @else<input class="st-in" wire:model="s.{{ $f }}" @if($def[1] === 'number') type="number" step="any" @endif>@endif
      </label>
    @endforeach
    </div>
  </x-filament::section>
  <x-filament::section heading="AI providers (free tiers, tried in order)" description="Keys are set only in the server .env file. Light model for quick tasks, heavy for briefs and research. Rate sheets, finance and payroll never use AI.">
    <table class="st-t"><tr><th>Order</th><th>Provider</th><th>Key set</th><th>On</th><th>Light model</th><th>Heavy model</th></tr>
    @foreach($providers as $i => $p)
      <tr><td><input class="st-in" style="width:64px" type="number" wire:model="providers.{{ $i }}.priority"></td><td>{{ $p['name'] }}</td><td>{{ $p['configured'] ? 'Yes' : 'No' }}</td>
      <td><input type="checkbox" wire:model="providers.{{ $i }}.is_enabled"></td><td><input class="st-in" wire:model="providers.{{ $i }}.light_model"></td><td><input class="st-in" wire:model="providers.{{ $i }}.heavy_model"></td></tr>
    @endforeach</table>
  </x-filament::section>
  <div><x-filament::button type="submit">Save settings</x-filament::button></div>
</form>
</x-filament-panels::page>
