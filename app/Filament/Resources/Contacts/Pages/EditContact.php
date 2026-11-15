<?php

namespace App\Filament\Resources\Contacts\Pages;

use App\Filament\Resources\Contacts\ContactResource;
use App\Models\Activity;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\EditRecord;

class EditContact extends EditRecord
{
    protected static string $resource = ContactResource::class;

    protected function getHeaderActions(): array
    {
        $c = $this->record;

        return [
            Action::make('log')->label('Log conversation')->icon('heroicon-o-chat-bubble-bottom-center-text')
                ->modalDescription('Record a Microsoft Teams chat, call or meeting so the whole team sees it on this customer.')
                ->schema([
                    Select::make('type')->options(['teams_log' => 'Teams chat', 'call' => 'Phone call', 'meeting' => 'Meeting', 'note' => 'Note'])->default('teams_log')->required(),
                    DateTimePicker::make('occurred_at')->default(now())->required(),
                    Textarea::make('summary')->rows(5)->required()->maxLength(5000),
                ])
                ->action(function (array $data) use ($c) {
                    Activity::create(['contact_id' => $c->id, 'actor_id' => auth()->id(), 'type' => $data['type'], 'summary' => $data['summary'], 'occurred_at' => $data['occurred_at']]);
                    $c->forceFill(['last_activity_at' => now()])->saveQuietly();
                    Notification::make()->title('Logged')->success()->send();
                }),
            Action::make('portal')->label('Invite to customer portal')->icon('heroicon-o-key')->color('gray')
                ->visible(fn () => (bool) $c->email && auth()->user()->canDo('crm.contacts', 'edit'))
                ->schema([Select::make('carrier_id')->label('Carrier account (telecom customers)')->options(\App\Models\Carrier::whereIn('role', ['customer', 'both'])->pluck('name', 'id'))->searchable()])
                ->action(function (array $data) use ($c) {
                    app(\App\Services\PortalAccess::class)->invite($c, $data['carrier_id'] ?? null);
                    Notification::make()->title('Invitation emailed to '.$c->email)->success()->send();
                }),
            Action::make('health')->label('Recalculate health')->color('gray')->icon('heroicon-o-heart')
                ->action(fn () => $c->forceFill(['health_score' => $c->computeHealth()])->save()),
            DeleteAction::make(),
        ];
    }
}
