@php
    $user = auth()->user();
    $next = $user?->canDo('attendance', 'create') ? \App\Filament\Widgets\ClockCard::state()[1] : null;
@endphp
@if ($next)
    <a href="{{ url('/clock') }}" @class(['fos-clock-pill', 'is-in' => $next === 'in', 'is-out' => $next === 'out'])
       title="{{ $next === 'in' ? 'Clock in here' : 'Clock out here' }}">
        <span class="fos-dot"></span>
        <span>{{ $next === 'in' ? 'Clock in' : 'Clock out' }}<span class="fos-clock-pill-text"> here</span></span>
    </a>
@endif
