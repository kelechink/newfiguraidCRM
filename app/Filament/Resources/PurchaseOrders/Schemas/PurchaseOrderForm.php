<?php

namespace App\Filament\Resources\PurchaseOrders\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Schema;

class PurchaseOrderForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('number')
                    ->required(),
                Select::make('rfq_id')
                    ->relationship('rfq', 'title'),
                Select::make('vendor_id')
                    ->relationship('vendor', 'name')
                    ->required(),
                TextInput::make('amount')
                    ->required()
                    ->numeric(),
                TextInput::make('currency')
                    ->required()
                    ->default('NGN'),
                TextInput::make('status')
                    ->required()
                    ->default('draft'),
                TextInput::make('delivery_status')
                    ->required()
                    ->default('pending'),
                DatePicker::make('expected_on'),
                Select::make('approved_by_id')
                    ->relationship('approvedBy', 'name'),
            ]);
    }
}
