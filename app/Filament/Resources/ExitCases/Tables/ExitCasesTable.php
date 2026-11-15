<?php

namespace App\Filament\Resources\ExitCases\Tables;

use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class ExitCasesTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('user.name')
                    ->searchable(),
                TextColumn::make('type')
                    ->searchable(),
                TextColumn::make('notice_date')
                    ->date()
                    ->sortable(),
                TextColumn::make('last_working_day')
                    ->date()
                    ->sortable(),
                TextColumn::make('access_revoked_at')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('status')
                    ->searchable(),
                TextColumn::make('handledBy.name')
                    ->searchable(),
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
                \Filament\Actions\Action::make('revoke')->label('Revoke access now')->color('danger')->icon('heroicon-o-no-symbol')->requiresConfirmation()
                    ->visible(fn ($record) => ! $record->access_revoked_at && auth()->user()->canDo('hr.staff', 'edit'))
                    ->action(function ($record) { \App\Services\Offboarding::revoke($record->user); $record->forceFill(['access_revoked_at' => now()])->save(); }),
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
