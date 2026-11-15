<x-filament-panels::page>
<style>
.cv{display:grid;gap:10px;max-width:900px}.cv-m{max-width:78%;padding:10px 14px;border-radius:16px;white-space:pre-wrap;line-height:1.5;font-size:14.5px}
.cv-in{background:rgba(127,127,127,.12);justify-self:start}.cv-out{background:#0b6f9e;color:#fff;justify-self:end}.cv-draft{border:1px dashed #0b6f9e;justify-self:end;opacity:.85}
.cv-meta{font-size:12px;opacity:.65;margin-top:4px}
</style>
@php($c = $this->record)
<x-filament::section :heading="($c->contact?->display_name ?? 'Unknown').' · '.ucfirst($c->channel)" :description="($c->category ? ucfirst($c->category).' · ' : '').'Assigned to '.($c->assignee?->name ?? 'nobody').($c->sla_due_at && ! $c->first_response_at ? ' · reply due '.$c->sla_due_at->diffForHumans() : '')">
  <div class="cv" wire:poll.15s>
    @forelse($c->messages()->get() as $m)
      <div class="cv-m {{ $m->delivery === 'draft' ? 'cv-draft' : ($m->direction === 'in' ? 'cv-in' : 'cv-out') }}">{{ $m->body }}
        <div class="cv-meta">{{ $m->delivery === 'draft' ? 'Draft by '.($m->agent_key ? 'Ada' : 'staff').' — use Reply to send' : ($m->direction === 'in' ? 'Customer' : ($m->agent_key ? \App\Models\AiAgent::where('key', $m->agent_key)->value('name').' (AI)' : ($m->author?->name ?? 'Staff'))) }} · {{ $m->created_at->format('j M H:i') }} @if($m->direction === 'out' && $m->delivery !== 'draft')· {{ $m->delivery }}@endif</div></div>
    @empty <p>No messages yet.</p> @endforelse
  </div>
</x-filament::section>
<x-filament::section heading="Details" collapsible collapsed>{{ $this->content }}</x-filament::section>
</x-filament-panels::page>
