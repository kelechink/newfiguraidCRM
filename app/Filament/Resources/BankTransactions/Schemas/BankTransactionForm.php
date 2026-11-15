<?php

namespace App\Filament\Resources\BankTransactions\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Schema;

class BankTransactionForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('bank_account_id')
                    ->relationship('bankAccount', 'name')
                    ->required(),
                DatePicker::make('date')
                    ->required(),
                TextInput::make('description')
                    ->required(),
                TextInput::make('amount')
                    ->required()
                    ->numeric(),
                TextInput::make('reference')
                    ->default(null),
                TextInput::make('match_status')
                    ->required()
                    ->default('unmatched'),
                Select::make('payment_id')
                    ->relationship('payment', 'id'),
                TextInput::make('suggested_invoice_id')
                    ->default(null),
                TextInput::make('match_confidence')
                    ->numeric()
                    ->default(null),
                TextInput::make('expense_id')
                    ->default(null),
            ]);
    }
}
