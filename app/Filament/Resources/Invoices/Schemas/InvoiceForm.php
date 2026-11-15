<?php

namespace App\Filament\Resources\Invoices\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class InvoiceForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('unit_id')
                    ->relationship('unit', 'name')
                    ->required(),
                TextInput::make('number')
                    ->required(),
                TextInput::make('kind')
                    ->required()
                    ->default('invoice'),
                Select::make('contact_id')
                    ->relationship('contact', 'id'),
                Select::make('carrier_id')
                    ->relationship('carrier', 'name'),
                Select::make('deal_id')
                    ->relationship('deal', 'title'),
                TextInput::make('currency')
                    ->required()
                    ->default('NGN'),
                TextInput::make('fx_rate')
                    ->required()
                    ->numeric()
                    ->default(1.0),
                DatePicker::make('issue_date')
                    ->required(),
                DatePicker::make('due_date')
                    ->required(),
                TextInput::make('subtotal')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('vat')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('wht')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('total')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('amount_paid')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('status')
                    ->required()
                    ->default('draft'),
                TextInput::make('external_ref')
                    ->default(null),
                Textarea::make('notes')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('signature_name')
                    ->default(null),
                DateTimePicker::make('signed_at'),
                Select::make('created_by_id')
                    ->relationship('createdBy', 'name'),
            ]);
    }
}
