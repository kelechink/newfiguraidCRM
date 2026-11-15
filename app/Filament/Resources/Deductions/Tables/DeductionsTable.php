<?php

namespace App\Filament\Resources\Deductions\Tables;

use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class DeductionsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('user.name')
                    ->searchable(),
                TextColumn::make('attendanceDay.id')
                    ->searchable(),
                TextColumn::make('payslip.id')
                    ->searchable(),
                TextColumn::make('type')
                    ->searchable(),
                TextColumn::make('amount')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('reason')
                    ->searchable(),
                TextColumn::make('status')
                    ->searchable(),
                TextColumn::make('period_month')
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
                \Filament\Actions\Action::make('waive')->label('Waive')->color('warning')->icon('heroicon-o-hand-raised')
                    ->visible(fn ($record) => $record->status !== 'waived' && ! $record->payslip_id && auth()->user()->canDo('hr.deductions', 'edit'))
                    ->schema([\Filament\Forms\Components\TextInput::make('why')->label('Reason for waiving')->required()])
                    ->action(function ($record, array $data) { $record->forceFill(['status' => 'waived', 'reason' => $record->reason.' — waived: '.$data['why']])->save();
                        app(\App\Services\Whiteboard::class)->retractForDeduction($record->attendance_day_id, $record->type, auth()->user()); }),
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
