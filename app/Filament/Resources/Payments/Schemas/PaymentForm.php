<?php

namespace App\Filament\Resources\Payments\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Schema;

class PaymentForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('unit_id')
                    ->relationship('unit', 'name')
                    ->required(),
                Select::make('invoice_id')
                    ->relationship('invoice', 'id'),
                Select::make('contact_id')
                    ->relationship('contact', 'id'),
                TextInput::make('gateway')
                    ->required(),
                TextInput::make('reference')
                    ->required(),
                TextInput::make('amount')
                    ->required()
                    ->numeric(),
                TextInput::make('currency')
                    ->required()
                    ->default('NGN'),
                TextInput::make('amount_ngn')
                    ->required()
                    ->numeric(),
                DateTimePicker::make('paid_at')
                    ->required(),
                TextInput::make('status')
                    ->required()
                    ->default('confirmed'),
                Toggle::make('verified_with_gateway')
                    ->required(),
                Textarea::make('meta')
                    ->default(null)
                    ->columnSpanFull(),
            ]);
    }
}
