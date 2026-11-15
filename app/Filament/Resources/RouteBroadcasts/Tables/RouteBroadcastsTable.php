<?php

namespace App\Filament\Resources\RouteBroadcasts\Tables;

use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class RouteBroadcastsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('subject')
                    ->searchable(),
                TextColumn::make('rateDeck.name')
                    ->searchable(),
                TextColumn::make('status')
                    ->searchable(),
                TextColumn::make('createdBy.name')
                    ->searchable(),
                TextColumn::make('approvedBy.name')
                    ->searchable(),
                TextColumn::make('sent_at')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('created_at')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('updated_at')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true)
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                //
            ])
            ->recordActions([
                \Filament\Actions\Action::make('approve')->label('Approve')->icon('heroicon-o-check')->color('success')->requiresConfirmation()
                    ->visible(fn ($record) => $record->status === 'draft' && (auth()->user()->canDo('telecom.broadcasts', 'approve') || auth()->user()->isRole('super_admin', 'admin', 'ops_manager')))
                    ->action(function ($record) { try { app(\App\Services\BroadcastService::class)->approve($record, auth()->user()); \Filament\Notifications\Notification::make()->title('Approved')->success()->send(); } catch (\RuntimeException $e) { \Filament\Notifications\Notification::make()->title($e->getMessage())->danger()->send(); } }),
                \Filament\Actions\Action::make('send')->label('Send now')->icon('heroicon-o-paper-airplane')->requiresConfirmation()
                    ->visible(fn ($record) => $record->status === 'approved' && auth()->user()->canDo('telecom.broadcasts', 'create'))
                    ->action(function ($record) { $log = app(\App\Services\BroadcastService::class)->send($record); \Filament\Notifications\Notification::make()->title('Broadcast sent')->body(collect($log)->map(fn ($l) => $l['carrier'].': '.$l['status'])->implode("\n"))->success()->persistent()->send(); }),
                EditAction::make()->visible(fn ($record) => $record->status === 'draft'),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
