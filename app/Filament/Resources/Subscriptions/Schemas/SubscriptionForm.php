<?php

namespace App\Filament\Resources\Subscriptions\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Schema;

class SubscriptionForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('side')
                    ->required(),
                Select::make('unit_id')
                    ->relationship('unit', 'name')
                    ->required(),
                Select::make('contact_id')
                    ->relationship('contact', 'id'),
                Select::make('vendor_id')
                    ->relationship('vendor', 'name'),
                TextInput::make('name')
                    ->required(),
                TextInput::make('kind')
                    ->required()
                    ->default('hosting'),
                TextInput::make('amount')
                    ->required()
                    ->numeric(),
                TextInput::make('currency')
                    ->required()
                    ->default('NGN'),
                TextInput::make('cycle')
                    ->required()
                    ->default('monthly'),
                DatePicker::make('next_due_on')
                    ->required(),
                TextInput::make('status')
                    ->required()
                    ->default('active'),
                Toggle::make('auto_renew')
                    ->required(),
                TextInput::make('external_ref')
                    ->default(null),
            ]);
    }
}
