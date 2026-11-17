<x-filament-panels::page>
<style>.mb-t{width:100%;border-collapse:collapse;font-size:14px}.mb-t td,.mb-t th{padding:10px 8px;border-bottom:1px solid rgba(127,127,127,.18);text-align:left;vertical-align:top}.mb-ok{color:#15803d}.mb-bad{color:#dc2626}</style>
<x-filament::section description="The system signs in to each mailbox (IMAP), reads new mail and marks it read. Nothing is deleted, so the mailbox remains a full copy. Replies go out from the same address the customer wrote to.">
<table class="mb-t"><tr><th>Address</th><th>What happens</th><th>Checked</th><th>Last result</th><th></th></tr>
@foreach($boxes as $b)
  <tr><td><strong>{{ $b['address'] }}</strong>@if(! empty($b['aliases']))<br><span style="opacity:.6">also {{ implode(', ', $b['aliases']) }}</span>@endif</td>
  <td>{{ $b['purpose'] }}</td>
  <td>{{ $b['key'] === 'rates' ? 'Hourly' : 'Every 5 minutes' }}</td>
  <td>@if(! $b['configured'])<span class="mb-bad">Password not set in .env</span>@elseif(isset($b['status']['error']))<span class="mb-bad">{{ $b['status']['error'] }}</span><br><span style="opacity:.6">{{ $b['status']['at'] ?? '' }}</span>@elseif($b['status'])<span class="mb-ok">{{ $b['status']['processed'] ?? 0 }} new</span> · {{ $b['status']['at'] ?? '' }}@else — @endif</td>
  <td>@if($b['configured'])<x-filament::button size="xs" color="gray" wire:click="check('{{ $b['key'] }}')">Check now</x-filament::button>@endif</td></tr>
@endforeach
</table>
</x-filament::section>
</x-filament-panels::page>
