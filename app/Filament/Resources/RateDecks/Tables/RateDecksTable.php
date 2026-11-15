<?php

namespace App\Filament\Resources\RateDecks\Tables;

use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class RateDecksTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('carrier.name')
                    ->searchable(),
                TextColumn::make('direction')
                    ->searchable(),
                TextColumn::make('name')
                    ->searchable(),
                TextColumn::make('currency')
                    ->searchable(),
                TextColumn::make('effective_from')
                    ->date()
                    ->sortable(),
                TextColumn::make('source')
                    ->searchable(),
                TextColumn::make('file.id')
                    ->searchable(),
                TextColumn::make('status')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('approvedBy.name')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('approved_at')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('created_at')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true)
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
                \Filament\Actions\Action::make('approve')->label('Approve & activate')->icon('heroicon-o-check-badge')->color('success')->requiresConfirmation()
                    ->modalDescription('Sell decks are checked again: any route below cost or under the minimum margin blocks approval.')
                    ->visible(fn ($record) => in_array($record->status, ['draft', 'blocked']) && \App\Authz\Access::can(auth()->user(), 'telecom.routes', 'approve') || (in_array($record->status, ['draft', 'blocked']) && auth()->user()->canDo('telecom.routes', 'edit') && auth()->user()->isRole('super_admin', 'admin', 'telecom_ops')))
                    ->action(function ($record) {
                        try {
                            app(\App\Services\RateDeckService::class)->approve($record, auth()->id());
                            \Filament\Notifications\Notification::make()->title('Deck active')->success()->send();
                        } catch (\RuntimeException $e) {
                            \Filament\Notifications\Notification::make()->title('Blocked')->body($e->getMessage())->danger()->persistent()->send();
                        }
                    }),
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
