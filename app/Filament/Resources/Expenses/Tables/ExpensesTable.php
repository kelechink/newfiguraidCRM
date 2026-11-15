<?php

namespace App\Filament\Resources\Expenses\Tables;

use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class ExpensesTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('unit.name')
                    ->searchable(),
                TextColumn::make('category.name')
                    ->searchable(),
                TextColumn::make('vendor.name')
                    ->searchable(),
                TextColumn::make('description')
                    ->searchable(),
                TextColumn::make('amount')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('currency')
                    ->searchable(),
                TextColumn::make('fx_rate')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('amount_ngn')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('vat')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('wht')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('date')
                    ->date()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('due_date')
                    ->date()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('status')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('receiptFile.id')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('requestedBy.name')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('approvedBy.name')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('approved_at')
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
                \Filament\Actions\Action::make('approve')->label('Approve')->icon('heroicon-o-check')->color('success')->requiresConfirmation()
                    ->visible(fn ($record) => $record->status === 'requested' && auth()->user()->canDo('finance.expenses', 'approve'))
                    ->action(function ($record) {
                        $limit = (float) \App\Models\Setting::get('finance.approval_limit_ngn', 500000);
                        if ($record->requested_by_id === auth()->id()) { \Filament\Notifications\Notification::make()->title('You cannot approve your own request.')->danger()->send(); return; }
                        if ((float) $record->amount_ngn > $limit && ! auth()->user()->isRole('super_admin', 'admin')) { \Filament\Notifications\Notification::make()->title('Above the ₦'.number_format($limit).' limit — needs Admin or Super Admin.')->warning()->send(); return; }
                        $record->forceFill(['status' => 'approved', 'approved_by_id' => auth()->id(), 'approved_at' => now()])->save();
                        \App\Models\User::find($record->requested_by_id)?->notify(new \App\Notifications\Alert('Expense approved', $record->description));
                    }),
                \Filament\Actions\Action::make('reject')->label('Reject')->color('danger')->requiresConfirmation()
                    ->visible(fn ($record) => $record->status === 'requested' && auth()->user()->canDo('finance.expenses', 'approve'))
                    ->action(fn ($record) => $record->forceFill(['status' => 'rejected', 'approved_by_id' => auth()->id(), 'approved_at' => now()])->save()),
                \Filament\Actions\Action::make('paid')->label('Mark paid')->color('gray')
                    ->visible(fn ($record) => $record->status === 'approved' && auth()->user()->canDo('finance.expenses', 'edit'))
                    ->action(fn ($record) => $record->forceFill(['status' => 'paid', 'paid_at' => now()])->save()),
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
