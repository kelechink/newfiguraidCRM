<x-filament-widgets::widget>
    <div class="fos-clock-card">
        <div class="fos-clock-grid">
            <div>
                <div class="fos-clock-eyebrow">{{ $today }} · Kano House · 09:00–17:00</div>
                <div class="fos-clock-title">{{ $greeting }}</div>
                <div class="fos-clock-sub">
                    @if ($pending)
                        Your clock-in was away from Kano House, so it counts once a manager approves it. Clock out as normal before you leave.
                    @elseif ($next === 'in' && ! $inAt)
                        Clock in from your phone when you arrive at the office.
                    @elseif ($next === 'out')
                        You're on the clock. Remember to clock out before you leave.
                    @else
                        You've clocked out for today. Have a good evening.
                    @endif
                </div>
                <div @class(['fos-clock-status', $status[1]])><i></i>{{ $status[0] }}</div>

                <div class="fos-clock-actions">
                    <a href="{{ url('/clock') }}" class="fos-btn fos-btn-in" @if ($next !== 'in') aria-disabled="true" tabindex="-1" @endif>
                        <x-filament::icon icon="heroicon-m-finger-print" />
                        Clock in here
                    </a>
                    <a href="{{ url('/clock') }}" class="fos-btn fos-btn-out" @if ($next !== 'out') aria-disabled="true" tabindex="-1" @endif>
                        <x-filament::icon icon="heroicon-m-arrow-right-start-on-rectangle" />
                        Clock out here
                    </a>
                    <a href="{{ url('/app/my-calendar') }}" class="fos-btn fos-btn-ghost">
                        <x-filament::icon icon="heroicon-m-calendar-days" />
                        My calendar
                    </a>
                </div>
            </div>

            <div class="fos-clock-facts">
                <div class="fos-fact">
                    <div class="fos-fact-label">Clocked in</div>
                    <div class="fos-fact-value">{{ $inAt ?? ($pending ? 'Pending' : '—') }}</div>
                </div>
                <div class="fos-fact">
                    <div class="fos-fact-label">Clocked out</div>
                    <div class="fos-fact-value">{{ $outAt ?? '—' }}</div>
                </div>
                <div class="fos-fact">
                    <div class="fos-fact-label">Next step</div>
                    <div class="fos-fact-value">{{ $next === 'in' ? 'Clock in' : 'Clock out' }}</div>
                </div>
                <div class="fos-fact">
                    <div class="fos-fact-label">Deductions (month)</div>
                    <div class="fos-fact-value">₦{{ number_format($deductions) }}</div>
                </div>
            </div>
        </div>
    </div>
</x-filament-widgets::widget>
