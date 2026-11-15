<?php

namespace App\Filament\Resources\AiActions\Tables;

use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class AiActionsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('agent_key')
                    ->searchable(),
                TextColumn::make('kind')
                    ->searchable(),
                TextColumn::make('subject_type')
                    ->searchable(),
                TextColumn::make('subject_id')
                    ->searchable(),
                TextColumn::make('status')
                    ->searchable(),
                TextColumn::make('decidedBy.name')
                    ->searchable(),
                TextColumn::make('decided_at')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('quality_score')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('provider')
                    ->searchable()
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
                \Filament\Actions\Action::make('approve')->label('Approve')->icon('heroicon-o-check')->color('success')->requiresConfirmation()
                    ->visible(fn ($record) => $record->status === 'pending_approval' && auth()->user()->isRole('super_admin', 'admin', 'ops_manager'))
                    ->action(fn ($record) => $record->forceFill(['status' => 'approved', 'decided_by_id' => auth()->id(), 'decided_at' => now()])->save()),
                \Filament\Actions\Action::make('reject')->label('Reject')->icon('heroicon-o-x-mark')->color('danger')
                    ->visible(fn ($record) => $record->status === 'pending_approval' && auth()->user()->isRole('super_admin', 'admin', 'ops_manager'))
                    ->action(fn ($record) => $record->forceFill(['status' => 'rejected', 'decided_by_id' => auth()->id(), 'decided_at' => now()])->save()),
                \Filament\Actions\Action::make('rate')->label('Rate quality')->icon('heroicon-o-star')->color('gray')
                    ->schema([\Filament\Forms\Components\Select::make('quality_score')->options([1 => '1 — wrong', 2 => '2', 3 => '3 — acceptable', 4 => '4', 5 => '5 — excellent'])->required()])
                    ->action(fn ($record, array $data) => $record->forceFill(['quality_score' => $data['quality_score']])->save()),
                \Filament\Actions\ViewAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
