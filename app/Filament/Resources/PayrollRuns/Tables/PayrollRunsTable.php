<?php

namespace App\Filament\Resources\PayrollRuns\Tables;

use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class PayrollRunsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('period_month')
                    ->searchable(),
                TextColumn::make('status')
                    ->searchable(),
                TextColumn::make('staff_count')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('preparedBy.name')
                    ->searchable(),
                TextColumn::make('approvedBy.name')
                    ->searchable(),
                TextColumn::make('approved_at')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('signedOffBy.name')
                    ->searchable(),
                TextColumn::make('signed_off_at')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('paid_at')
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
                \Filament\Actions\Action::make('prepare')->label('Calculate')->icon('heroicon-o-calculator')->visible(fn ($record) => in_array($record->status, ['draft', 'in_review']) && auth()->user()->canDo('payroll', 'edit'))
                    ->schema([\Filament\Forms\Components\TextInput::make('password')->label('Confirm your password')->password()->required()->rule(fn () => function ($a, $v, $fail) { if (! \Illuminate\Support\Facades\Hash::check($v, auth()->user()->password)) { $fail('Password is incorrect.'); } })])
                    ->action(function ($record) { app(\App\Services\PayrollService::class)->prepare($record); \Filament\Notifications\Notification::make()->title('Payroll calculated')->success()->send(); }),
                \Filament\Actions\Action::make('approve')->label('Approve')->icon('heroicon-o-check')->color('success')->visible(fn ($record) => $record->status === 'in_review' && auth()->user()->canDo('payroll', 'approve'))
                    ->schema([\Filament\Forms\Components\TextInput::make('password')->label('Confirm your password')->password()->required()->rule(fn () => function ($a, $v, $fail) { if (! \Illuminate\Support\Facades\Hash::check($v, auth()->user()->password)) { $fail('Password is incorrect.'); } })])
                    ->action(function ($record) { try { app(\App\Services\PayrollService::class)->approve($record, auth()->user()); \Filament\Notifications\Notification::make()->title('Approved')->success()->send(); } catch (\RuntimeException $e) { \Filament\Notifications\Notification::make()->title($e->getMessage())->danger()->send(); } }),
                \Filament\Actions\Action::make('signoff')->label('Sign off')->icon('heroicon-o-shield-check')->color('warning')->visible(fn ($record) => $record->status === 'approved' && auth()->user()->canDo('payroll.signoff', 'approve'))
                    ->schema([\Filament\Forms\Components\TextInput::make('password')->label('Confirm your password')->password()->required()->rule(fn () => function ($a, $v, $fail) { if (! \Illuminate\Support\Facades\Hash::check($v, auth()->user()->password)) { $fail('Password is incorrect.'); } })])
                    ->action(function ($record) { app(\App\Services\PayrollService::class)->signOff($record, auth()->user()); \Filament\Notifications\Notification::make()->title('Signed off')->success()->send(); }),
                \Filament\Actions\Action::make('paid')->label('Mark paid')->color('gray')->visible(fn ($record) => $record->status === 'signed_off' && auth()->user()->canDo('payroll', 'edit'))
                    ->requiresConfirmation()->action(fn ($record) => $record->forceFill(['status' => 'paid', 'paid_at' => now()])->save()),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
