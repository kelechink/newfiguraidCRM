<?php

namespace App\Filament\Resources\Debts\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class DebtForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('lender')
                    ->required(),
                TextInput::make('kind')
                    ->required()
                    ->default('loan'),
                TextInput::make('principal')
                    ->required()
                    ->numeric(),
                TextInput::make('outstanding')
                    ->required()
                    ->numeric(),
                TextInput::make('currency')
                    ->required()
                    ->default('NGN'),
                TextInput::make('interest_rate_pct')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                DatePicker::make('start_date')
                    ->required(),
                DatePicker::make('end_date'),
                TextInput::make('instalment')
                    ->numeric()
                    ->default(null),
                TextInput::make('frequency')
                    ->required()
                    ->default('monthly'),
                DatePicker::make('next_payment_on'),
                Textarea::make('notes')
                    ->default(null)
                    ->columnSpanFull(),
            ]);
    }
}
