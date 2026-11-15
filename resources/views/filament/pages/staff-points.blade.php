<x-filament-panels::page>
<style>.sp-t{width:100%;border-collapse:collapse;font-size:14px}.sp-t td,.sp-t th{padding:9px 8px;border-bottom:1px solid rgba(127,127,127,.18);text-align:left}.sp-t .r{text-align:right;font-variant-numeric:tabular-nums}.sp-me{background:rgba(11,111,158,.08)}.sp-neg{color:#dc2626}</style>
<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
  <select wire:model.live="month" style="border-radius:10px;border:1px solid rgba(127,127,127,.35);padding:8px 10px;background:transparent">@foreach($months as $k => $l)<option value="{{ $k }}">{{ $l }}</option>@endforeach</select>
  <x-filament::button size="sm" color="gray" wire:click="refreshPoints">Recalculate</x-filament::button>
  <span style="opacity:.7;font-size:13px">Calculated by code from attendance, tasks, customer replies, reports, training and targets. Amara posts the results on the 1st.</span>
</div>
@if($mine)
<x-filament::section :heading="'Your points: '.$mine->points.' (rank '.$mine->rank.' of '.$rows->count().')'">
  <table class="sp-t">@foreach(\App\Services\StaffPoints::RULES as $k => [$w, $label])@php($b = $mine->breakdown[$k] ?? ['count' => 0, 'points' => 0])
    <tr><td>{{ $label }}</td><td class="r">{{ $w > 0 ? '+' : '' }}{{ $w }} each</td><td class="r">× {{ $b['count'] }}</td><td class="r {{ $b['points'] < 0 ? 'sp-neg' : '' }}">{{ $b['points'] }}</td></tr>@endforeach</table>
</x-filament::section>
@endif
<x-filament::section heading="Leaderboard">
  <table class="sp-t"><tr><th>#</th><th>Name</th><th class="r">Points</th>@if($seeAll)<th class="r">On time</th><th class="r">Late</th><th class="r">Absent</th><th class="r">Tasks on time</th>@endif</tr>
  @foreach($rows as $r)<tr class="{{ $r->user_id === auth()->id() ? 'sp-me' : '' }}"><td>{{ $r->rank }}</td><td>{{ $r->user->name }}</td><td class="r {{ $r->points < 0 ? 'sp-neg' : '' }}"><strong>{{ $r->points }}</strong></td>
  @if($seeAll)<td class="r">{{ $r->breakdown['on_time_day']['count'] ?? 0 }}</td><td class="r">{{ $r->breakdown['late_day']['count'] ?? 0 }}</td><td class="r">{{ $r->breakdown['absence']['count'] ?? 0 }}</td><td class="r">{{ $r->breakdown['task_on_time']['count'] ?? 0 }}</td>@endif</tr>@endforeach</table>
</x-filament::section>
</x-filament-panels::page>
