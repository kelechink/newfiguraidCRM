<?php

namespace App\Filament\Resources\BankTransactions\Tables;

use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class BankTransactionsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('bankAccount.name')
                    ->searchable(),
                TextColumn::make('date')
                    ->date()
                    ->sortable(),
                TextColumn::make('description')
                    ->searchable(),
                TextColumn::make('amount')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('reference')
                    ->searchable(),
                TextColumn::make('match_status')
                    ->searchable(),
                TextColumn::make('payment.id')
                    ->searchable(),
                TextColumn::make('suggested_invoice_id')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('match_confidence')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('expense_id')
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
                \Filament\Actions\Action::make('confirm')->label('Confirm match')->icon('heroicon-o-check')->color('success')
                    ->visible(fn ($record) => $record->match_status !== 'matched' && $record->amount > 0 && auth()->user()->canDo('finance.bank', 'edit'))
                    ->schema([\Filament\Forms\Components\Select::make('invoice_id')->label('Invoice')->required()
                        ->default(fn ($record) => $record->suggested_invoice_id)
                        ->options(fn () => \App\Models\Invoice::whereIn('status', ['sent', 'part_paid', 'overdue'])->where('kind', 'invoice')->get()->mapWithKeys(fn ($i) => [$i->id => "$i->number · $i->currency ".number_format($i->outstanding(), 2)]))->searchable()])
                    ->action(function ($record, array $data) {
                        app(\App\Services\BankMatcher::class)->confirm($record, \App\Models\Invoice::findOrFail($data['invoice_id']));
                        \Filament\Notifications\Notification::make()->title('Payment recorded')->success()->send();
                    }),
                \Filament\Actions\Action::make('ignore')->label('Not an invoice payment')->color('gray')->visible(fn ($record) => $record->match_status !== 'matched')
                    ->action(fn ($record) => $record->forceFill(['match_status' => 'ignored'])->save()),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
