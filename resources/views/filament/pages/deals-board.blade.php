<x-filament-panels::page>
<style>
.kb-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.kb-bar select,.kb-bar input{border-radius:10px;border:1px solid rgba(127,127,127,.3);padding:8px 10px;background:transparent;font-size:14px}
.kb{display:flex;gap:14px;overflow-x:auto;padding-bottom:12px;scroll-snap-type:x proximity}
.kb-col{flex:0 0 290px;scroll-snap-align:start;border-radius:16px;background:rgba(127,127,127,.07);padding:10px;display:flex;flex-direction:column;gap:10px;min-height:240px}
.kb-col.over{outline:2px dashed var(--primary-500,#0b6f9e)}
.kb-head{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:14px;padding:4px 6px}
.kb-dot{width:10px;height:10px;border-radius:50%;display:inline-block;margin-right:8px}
.kb-card{border-radius:12px;background:#fff;border:1px solid rgba(0,0,0,.07);padding:12px;cursor:grab;display:grid;gap:6px;border-left:4px solid var(--c);box-shadow:0 1px 2px rgba(0,0,0,.04)}
.dark .kb-card{background:#18181b;border-color:rgba(255,255,255,.08)}
.kb-card:active{cursor:grabbing}.kb-card h4{font-weight:600;font-size:14px;line-height:1.3}
.kb-meta{display:flex;justify-content:space-between;font-size:12.5px;opacity:.75}.kb-val{font-weight:650;font-variant-numeric:tabular-nums}
.kb-quick{position:fixed;right:0;top:0;bottom:0;width:min(420px,100vw);background:#fff;z-index:40;box-shadow:-10px 0 40px rgba(0,0,0,.2);padding:24px;overflow:auto;display:grid;gap:12px;align-content:start}
.dark .kb-quick{background:#18181b}
</style>
<div class="kb-bar">
  <select wire:model.live="pipelineId" aria-label="Pipeline">@foreach($pipelines as $p)<option value="{{ $p->id }}">{{ $p->name }}</option>@endforeach</select>
  <input type="search" wire:model.live.debounce.300ms="search" placeholder="Search deals" aria-label="Search deals">
  <select wire:model.live="owner" aria-label="Owner"><option value="">Everyone</option><option value="me">My deals</option></select>
  <x-filament::button tag="a" href="{{ \App\Filament\Resources\Deals\DealResource::getUrl('create') }}" icon="heroicon-o-plus" size="sm">New deal</x-filament::button>
  <x-filament::button tag="a" href="{{ \App\Filament\Resources\Deals\DealResource::getUrl('index') }}" color="gray" size="sm">List view</x-filament::button>
</div>
@if($pipeline)
<div class="kb" x-data="{ drag: null }">
  @foreach($pipeline->stages as $stage)
    @php($list = $deals->get($stage->id, collect()))
    <section class="kb-col" x-on:dragover.prevent="$el.classList.add('over')" x-on:dragleave="$el.classList.remove('over')"
      x-on:drop.prevent="$el.classList.remove('over'); if (drag) $wire.moveDeal(drag, '{{ $stage->id }}')" aria-label="{{ $stage->name }}">
      <div class="kb-head"><span><span class="kb-dot" style="background:{{ $stage->color ?? '#94a3b8' }}"></span>{{ $stage->name }}</span><span style="opacity:.7">{{ $list->count() }} · {{ \App\Filament\Widgets\Metrics::ngn($list->sum($ngn)) }}</span></div>
      @foreach($list as $d)
        <article class="kb-card" style="--c: {{ $stage->color ?? '#94a3b8' }}" draggable="true" x-on:dragstart="drag = '{{ $d->id }}'" wire:click="$set('quick', '{{ $d->id }}')" tabindex="0" wire:keydown.enter="$set('quick', '{{ $d->id }}')">
          <h4>{{ $d->title }}</h4>
          <div class="kb-meta"><span>{{ $d->contact?->display_name ?? 'No contact' }}</span><span class="kb-val">{{ $d->currency }} {{ number_format($d->value) }}</span></div>
          <div class="kb-meta"><span>{{ $d->owner?->name ?? 'Unassigned' }}</span><span>{{ $d->next_action_on ? ($d->next_action_on->isPast() ? 'Overdue · ' : '').$d->next_action_on->format('j M') : '' }}</span></div>
        </article>
      @endforeach
    </section>
  @endforeach
</div>
@else
<p>No pipeline yet.</p>
@endif
@if($quickDeal)
<aside class="kb-quick" role="dialog" aria-label="Deal quick view">
  <div style="display:flex;justify-content:space-between"><h2 style="font-size:20px;font-weight:650">{{ $quickDeal->title }}</h2><button wire:click="$set('quick', null)" aria-label="Close" style="font-size:24px">×</button></div>
  <p><strong>{{ $quickDeal->currency }} {{ number_format($quickDeal->value, 2) }}</strong> · {{ $quickDeal->stage?->name }}</p>
  <p>Contact: {{ $quickDeal->contact?->display_name }} {{ $quickDeal->contact?->email ? '· '.$quickDeal->contact->email : '' }}</p>
  <p>Owner: {{ $quickDeal->owner?->name ?? 'Unassigned' }} · Next: {{ $quickDeal->next_action ?? '—' }} {{ $quickDeal->next_action_on?->format('j M') }}</p>
  <h3 style="font-weight:600;margin-top:8px">Activity</h3>
  @forelse($activities as $a)<p style="font-size:13.5px"><span style="opacity:.6">{{ $a->occurred_at->format('j M H:i') }}</span> — {{ $a->summary }}</p>@empty<p style="opacity:.6">No activity yet.</p>@endforelse
  <x-filament::button tag="a" href="{{ \App\Filament\Resources\Deals\DealResource::getUrl('edit', ['record' => $quickDeal]) }}">Open deal</x-filament::button>
</aside>
@endif
</x-filament-panels::page>
