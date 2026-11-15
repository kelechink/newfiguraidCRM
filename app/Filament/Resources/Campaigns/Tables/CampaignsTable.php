<?php

namespace App\Filament\Resources\Campaigns\Tables;

use App\Services\CampaignService;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Notifications\Notification;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class CampaignsTable
{
    public static function configure(Table $table): Table
    {
        return $table->defaultSort('created_at', 'desc')->columns([
            TextColumn::make('name')->searchable()->weight('bold')->description(fn ($record) => $record->subject),
            TextColumn::make('unit.name'),
            TextColumn::make('status')->badge()->color(fn ($state) => match ($state) { 'sent' => 'success', 'sending', 'approved' => 'info', 'cancelled' => 'gray', default => 'warning' }),
            TextColumn::make('recipients')->numeric(),
            TextColumn::make('sent_count')->label('Sent')->numeric(),
            TextColumn::make('failed_count')->label('Failed')->numeric(),
            TextColumn::make('sent_at')->dateTime('j M Y H:i'),
        ])->recordActions([
            Action::make('draft')->label('Seyi: write it')->icon('heroicon-o-sparkles')->color('gray')
                ->visible(fn ($record) => $record->status === 'draft' && filled($record->brief))
                ->action(function ($record) {
                    try {
                        app(CampaignService::class)->draft($record);
                        Notification::make()->title('Draft written — review before approval')->success()->send();
                    } catch (\Throwable $e) {
                        Notification::make()->title('AI unavailable')->body($e->getMessage())->warning()->send();
                    }
                }),
            Action::make('approve')->label('Approve & schedule')->icon('heroicon-o-check')->color('success')->requiresConfirmation()
                ->modalDescription('Locks the audience (opted-in contacts only) and sends in batches of 150 per minute.')
                ->visible(fn ($record) => in_array($record->status, ['draft', 'pending_approval']) && (auth()->user()->canDo('marketing.campaigns', 'approve')))
                ->action(function ($record) {
                    try {
                        app(CampaignService::class)->approve($record, auth()->user());
                        Notification::make()->title('Approved — '.$record->fresh()->recipients.' recipients')->success()->send();
                    } catch (\RuntimeException $e) {
                        Notification::make()->title($e->getMessage())->danger()->send();
                    }
                }),
            Action::make('cancel')->label('Stop')->color('danger')->requiresConfirmation()->visible(fn ($record) => in_array($record->status, ['approved', 'sending']))
                ->action(fn ($record) => $record->forceFill(['status' => 'cancelled'])->save()),
            EditAction::make()->visible(fn ($record) => in_array($record->status, ['draft', 'pending_approval'])),
        ]);
    }
}
