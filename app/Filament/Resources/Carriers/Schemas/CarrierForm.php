<?php

namespace App\Filament\Resources\Carriers\Schemas;

use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class CarrierForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->required(),
                TextInput::make('role')
                    ->required()
                    ->default('customer'),
                TextInput::make('country')
                    ->default(null),
                TextInput::make('currency')
                    ->required()
                    ->default('USD'),
                TextInput::make('billing_cycle')
                    ->required()
                    ->default('7/3'),
                TextInput::make('increment_first')
                    ->required()
                    ->numeric()
                    ->default(60),
                TextInput::make('increment_next')
                    ->required()
                    ->numeric()
                    ->default(60),
                TextInput::make('credit_limit')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('prepaid_balance')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('kyc_status')
                    ->required()
                    ->default('pending'),
                TextInput::make('status')
                    ->required()
                    ->default('testing'),
                Select::make('contact_id')
                    ->relationship('contact', 'id'),
                Select::make('account_manager_id')
                    ->relationship('accountManager', 'name'),
                TextInput::make('rate_email')
                    ->email()
                    ->default(null),
                Textarea::make('notes')
                    ->default(null)
                    ->columnSpanFull(),
            ]);
    }
}
