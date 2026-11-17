<?php

namespace App\Filament\Pages;

use App\Authz\Access;
use App\Models\Setting;
use BackedEnum;
use Filament\Notifications\Notification;
use Filament\Pages\Page;
use Illuminate\Support\Facades\Artisan;

/** Status of the mailboxes the system reads. Passwords are never shown — only whether one is set. */
class Mailboxes extends Page
{
    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-envelope';

    protected static string|\UnitEnum|null $navigationGroup = 'Admin';

    protected static ?int $navigationSort = 14;

    protected string $view = 'filament.pages.mailboxes';

    public static function canAccess(): bool
    {
        return Access::can(auth()->user(), 'settings', 'edit');
    }

    public function check(string $key): void
    {
        abort_unless(array_key_exists($key, config('mailboxes.boxes')), 404);
        Artisan::call('mail:poll', ['box' => $key]);
        $s = Setting::get("mailbox.status.$key", []);
        Notification::make()->title(isset($s['error']) ? 'Could not read '.$key.'@: '.$s['error'] : ucfirst($key).'@ checked: '.($s['processed'] ?? 0).' new email(s)')->{isset($s['error']) ? 'danger' : 'success'}()->send();
    }

    protected function getViewData(): array
    {
        return ['boxes' => collect(config('mailboxes.boxes'))->map(fn ($b, $k) => $b + ['key' => $k, 'configured' => (bool) $b['password'], 'status' => Setting::get("mailbox.status.$k")])];
    }
}
