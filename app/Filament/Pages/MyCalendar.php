<?php

namespace App\Filament\Pages;

use App\Services\CalendarFeed;
use BackedEnum;
use Filament\Pages\Page;

/** Personal calendar feed: subscribe once in Google Calendar or Outlook. */
class MyCalendar extends Page
{
    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-calendar-days';

    protected static string|\UnitEnum|null $navigationGroup = 'Today';

    protected static ?int $navigationSort = 9;

    protected static ?string $title = 'My calendar';

    protected string $view = 'filament.pages.my-calendar';

    public function reset_(): void
    {
        auth()->user()->forceFill(['calendar_token' => null])->save();
    }

    protected function getViewData(): array
    {
        $u = auth()->user();

        return ['feed' => route('calendar.feed', CalendarFeed::tokenFor($u)), 'booking' => route('booking.show', $u->id)];
    }
}
