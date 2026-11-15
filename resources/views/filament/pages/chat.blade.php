<x-filament-panels::page>
<style>
.ch{display:grid;grid-template-columns:240px 1fr;gap:16px;min-height:60vh}@media(max-width:768px){.ch{grid-template-columns:1fr}}
.ch-side{display:flex;flex-direction:column;gap:4px}.ch-side button{text-align:left;padding:8px 10px;border-radius:10px;font-size:14px}.ch-side button.on{background:rgba(11,111,158,.12);font-weight:600}
.ch-main{display:flex;flex-direction:column;border:1px solid rgba(127,127,127,.2);border-radius:16px;overflow:hidden}
.ch-log{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px;max-height:60vh}
.ch-msg{display:grid;grid-template-columns:32px 1fr;gap:10px}.ch-av{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:12px;font-weight:600}
.ch-body{white-space:pre-wrap;font-size:14.5px;line-height:1.5}.ch-meta{font-size:12px;opacity:.6}.ch-meta button{margin-left:8px;text-decoration:underline}
.ch-form{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(127,127,127,.2)}.ch-form textarea,.ch-side select{flex:1;border-radius:10px;border:1px solid rgba(127,127,127,.35);padding:8px 10px;background:transparent;font-size:15px}
</style>
<div class="ch">
  <nav class="ch-side" aria-label="Channels">
    @foreach($channels as $c)
      <button wire:click="$set('channelId', '{{ $c->id }}')" class="{{ $current?->id === $c->id ? 'on' : '' }}">{{ $c->agent_key ? '✦ '.$c->name : ($c->kind === 'direct' ? '@ '.$c->members->where('id', '!=', auth()->id())->pluck('name')->implode(', ') : '# '.$c->name) }}</button>
    @endforeach
    <div style="margin-top:12px;display:grid;gap:6px"><select wire:model="dmUser" aria-label="Message someone"><option value="">Message someone…</option>@foreach($people as $id => $n)<option value="{{ $id }}">{{ $n }}</option>@endforeach</select>
    <x-filament::button size="xs" color="gray" wire:click="openDm">Open</x-filament::button></div>
  </nav>
  <section class="ch-main">
    <div class="ch-log" wire:poll.10s>
      @forelse($messages as $m)
        @php($agent = $m->agent_key ? ($agents[$m->agent_key] ?? 'AI') : null)
        <div class="ch-msg">
          <div class="ch-av" style="background:{{ $agent ? ($colors[$m->agent_key] ?? '#4cc9ff') : '#0b6f9e' }}">{{ mb_substr($agent ?? $m->author?->name ?? '?', 0, 1) }}</div>
          <div><div class="ch-meta"><strong>{{ $agent ? $agent.' (AI)' : $m->author?->name }}</strong> · {{ $m->created_at->format('j M H:i') }}<button wire:click="toTask('{{ $m->id }}')">Make task</button></div><div class="ch-body">{{ $m->body }}</div></div>
        </div>
      @empty <p style="opacity:.6">No messages yet. Say hello — use @Name to mention someone.</p> @endforelse
    </div>
    <form class="ch-form" wire:submit="send"><label class="sr-only" for="chat-body">Message</label><textarea id="chat-body" rows="2" wire:model="body" placeholder="Message #{{ $current?->name ?? 'chat' }} — @Name to mention"></textarea><x-filament::button type="submit">Send</x-filament::button></form>
  </section>
</div>
</x-filament-panels::page>
