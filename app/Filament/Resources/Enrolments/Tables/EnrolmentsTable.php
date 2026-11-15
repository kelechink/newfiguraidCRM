<?php

namespace App\Filament\Resources\Enrolments\Tables;

use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class EnrolmentsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('cohort.name')
                    ->searchable(),
                TextColumn::make('contact.id')
                    ->searchable(),
                TextColumn::make('status')
                    ->searchable(),
                TextColumn::make('fee')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('scholarship_pct')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('amount_paid')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('paystack_reference')
                    ->searchable(),
                TextColumn::make('attendance_pct')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('certificate_code')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('certificate_issued_at')
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
                \Filament\Actions\Action::make('certificate')->label(fn ($record) => $record->certificate_issued_at ? 'Certificate PDF' : 'Issue certificate')->icon('heroicon-o-academic-cap')
                    ->visible(fn ($record) => auth()->user()->canDo('academy.certificates', $record->certificate_issued_at ? 'view' : 'create'))
                    ->action(function ($record) {
                        try {
                            $e = app(\App\Services\Certificates::class)->issue($record);

                            return response()->streamDownload(fn () => print(app(\App\Services\Certificates::class)->pdf($e)), 'certificate-'.$e->certificate_code.'.pdf');
                        } catch (\RuntimeException $ex) {
                            \Filament\Notifications\Notification::make()->title($ex->getMessage())->warning()->send();
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
