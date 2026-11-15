<x-filament-panels::page>
<style>
.wb-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wb-chip{border-radius:999px;padding:5px 12px;font-size:13px;font-weight:600;border:1px solid rgba(127,127,127,.3);cursor:pointer;background:transparent}
.wb-chip.on{background:#0b6f9e;color:#fff;border-color:#0b6f9e}
.wb-chip.callout{color:#b91c1c}.wb-chip.kudos{color:#15803d}.wb-chip.on.callout,.wb-chip.on.kudos{color:#fff}
.wb-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
.wb-card{border-radius:16px;padding:16px;display:grid;gap:8px;border:1px solid rgba(127,127,127,.18);background:#fff;border-top:5px solid var(--c)}
.dark .wb-card{background:rgba(255,255,255,.04)}
.wb-who{display:flex;align-items:center;gap:10px}.wb-av{width:34px;height:34px;border-radius:50%}
.wb-tags{display:flex;gap:6px;flex-wrap:wrap}.wb-tag{font-weight:700;font-size:13px;padding:2px 8px;border-radius:8px;background:var(--bg);color:var(--fg)}
.wb-meta{font-size:12px;opacity:.65}.wb-in{width:100%;border-radius:10px;border:1px solid rgba(127,127,127,.35);padding:8px 10px;background:transparent;font-size:14px}
.wb-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:4px}
</style>

@unless($calloutsOn)<x-filament::section>Call-outs are switched off in Settings. Kudos still post.</x-filament::section>@endunless

<div class="wb-bar" role="toolbar" aria-label="Filters">
  @foreach(['all' => 'Everything', 'callout' => 'Call-outs', 'kudos' => 'Kudos'] as $k => $l)
    <button class="wb-chip {{ $kind === $k ? 'on' : '' }}" wire:click="$set('kind', '{{ $k }}')">{{ $l }}</button>
  @endforeach
  <select class="wb-in" style="width:auto" wire:model.live="person" aria-label="Person"><option value="">Everyone</option>@foreach($people as $id => $n)<option value="{{ $id }}">{{ $n }}</option>@endforeach</select>
  @if($tag)<button class="wb-chip on" wire:click="$set('tag', null)">#{{ $tag }} ✕</button>@endif
</div>
<div class="wb-bar" aria-label="Hashtags this month">
  @forelse($tagCounts as $t => $c)
    <button class="wb-chip {{ $tags[$t][1] ?? 'callout' }} {{ $tag === $t ? 'on' : '' }}" wire:click="$set('tag', '{{ $t }}')" title="{{ $tags[$t][0] ?? '' }}">#{{ $t }} · {{ $c }}</button>
  @empty <span class="wb-meta">No hashtags yet this month.</span> @endforelse
</div>

<div class="wb-grid" wire:poll.30s>
  @forelse($posts as $p)
    @php($a = $p->agent_key ? ($agents[$p->agent_key] ?? null) : null)
    @php($isCallout = $p->kind === 'callout')
    <article class="wb-card" style="--c: {{ $isCallout ? '#dc2626' : '#16a34a' }}">
      <div class="wb-who">
        <img class="wb-av" src="{{ $p->subject?->getFilamentAvatarUrl() }}" alt="">
        <div><strong>{{ $p->subject?->name }}</strong><div class="wb-meta">{{ $p->created_at->timezone('Africa/Lagos')->format('D j M, H:i') }}</div></div>
      </div>
      <div class="wb-tags">@foreach($p->hashtags as $t)<span class="wb-tag" style="--bg: {{ $isCallout ? 'rgba(220,38,38,.1)' : 'rgba(22,163,74,.12)' }}; --fg: {{ $isCallout ? '#b91c1c' : '#15803d' }}">#{{ $t }}</span>@endforeach</div>
      <p>{{ $p->subject?->name }} {{ $p->body }}</p>
      <div class="wb-meta">Posted by {{ $a ? $a->name.' ('.$a->role.', AI)' : ($p->author?->name ?? 'System') }} · comes down {{ $p->expires_at?->diffForHumans() }}</div>
      <div class="wb-actions">
        @if($isCallout && $p->subject_user_id === auth()->id())
          <div x-data="{ open: false }" style="width:100%">
            <x-filament::button size="xs" color="gray" x-on:click="open = !open">Dispute</x-filament::button>
            <div x-show="open" style="display:grid;gap:6px;margin-top:6px"><textarea class="wb-in" rows="2" wire:model="disputeText" placeholder="What happened? (HR will review)"></textarea><x-filament::button size="xs" wire:click="dispute('{{ $p->id }}')">Send to HR</x-filament::button></div>
          </div>
        @endif
        @if($canModerate)
          <div x-data="{ open: false }" style="width:100%">
            <x-filament::button size="xs" color="danger" x-on:click="open = !open">Take down</x-filament::button>
            <div x-show="open" style="display:grid;gap:6px;margin-top:6px"><input class="wb-in" wire:model="retractReason" placeholder="Reason (the person is told)"><x-filament::button size="xs" color="danger" wire:click="retract('{{ $p->id }}')">Confirm</x-filament::button></div>
          </div>
        @endif
      </div>
    </article>
  @empty
    <p class="wb-meta">Nothing on the Whiteboard{{ $tag ? ' for #'.$tag : '' }}.</p>
  @endforelse
</div>

<x-filament::section :heading="$canModerate ? 'Post to the Whiteboard' : 'Give someone a shout-out'" collapsible collapsed>
  <form wire:submit="postNew" style="display:grid;gap:10px;max-width:560px">
    <select class="wb-in" wire:model="newUser" required><option value="">Who?</option>@foreach($people as $id => $n)<option value="{{ $id }}">{{ $n }}</option>@endforeach</select>
    <div class="wb-bar">@foreach($tags as $t => [$label, $k])@if($canModerate || $k === 'kudos')<label class="wb-chip {{ $k }}" title="{{ $label }}"><input type="checkbox" value="{{ $t }}" wire:model="newTags" style="margin-right:4px">#{{ $t }}</label>@endif @endforeach</div>
    <input class="wb-in" wire:model="newNote" maxlength="300" placeholder="e.g. closed the Kudi Pay deal two weeks early" required>
    @error('newNote')<p style="color:#dc2626">{{ $message }}</p>@enderror
    <div><x-filament::button type="submit">Post</x-filament::button></div>
  </form>
</x-filament::section>
</x-filament-panels::page>
