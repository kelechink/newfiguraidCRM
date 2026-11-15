<?php

namespace App\Filament\Resources\AttendancePunches\Tables;

use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class AttendancePunchesTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('attendanceDay.id')
                    ->searchable(),
                TextColumn::make('user.name')
                    ->searchable(),
                TextColumn::make('type')
                    ->searchable(),
                TextColumn::make('device_time')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('server_time')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('latitude')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('longitude')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('accuracy_m')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('distance_m')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                IconColumn::make('within_geofence')
                    ->boolean()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('office.name')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('selfie_file_id')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('device.id')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('review_status')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('reviewedBy.name')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('review_note')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('ip')
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
                \Filament\Actions\Action::make('approve')->label('Approve punch')->icon('heroicon-o-check')->color('success')
                    ->visible(fn ($record) => $record->review_status === 'pending' && $record->user_id !== auth()->id() && auth()->user()->canDo('attendance.review', 'approve'))
                    ->schema([\Filament\Forms\Components\TextInput::make('review_note')->label('Reason (e.g. client visit approved)')->required()])
                    ->action(function ($record, array $data) { $record->forceFill(['review_status' => 'approved', 'reviewed_by_id' => auth()->id(), 'review_note' => $data['review_note']])->save();
                        app(\App\Services\AttendanceService::class)->recompute($record->user, $record->attendanceDay->date->toDateString()); }),
                \Filament\Actions\Action::make('reject')->label('Reject')->color('danger')
                    ->visible(fn ($record) => $record->review_status === 'pending' && auth()->user()->canDo('attendance.review', 'approve'))
                    ->action(function ($record) { $record->forceFill(['review_status' => 'rejected', 'reviewed_by_id' => auth()->id()])->save();
                        app(\App\Services\AttendanceService::class)->recompute($record->user, $record->attendanceDay->date->toDateString()); }),
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
