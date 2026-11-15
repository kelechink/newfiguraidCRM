<?php

namespace App\Filament\Resources\Expenses\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Schema;

class ExpenseForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('unit_id')
                    ->relationship('unit', 'name')
                    ->required(),
                Select::make('category_id')
                    ->relationship('category', 'name')
                    ->default(null),
                Select::make('vendor_id')
                    ->relationship('vendor', 'name'),
                TextInput::make('description')
                    ->required(),
                TextInput::make('amount')
                    ->required()
                    ->numeric(),
                TextInput::make('currency')
                    ->required()
                    ->default('NGN'),
                TextInput::make('fx_rate')
                    ->required()
                    ->numeric()
                    ->default(1.0),
                TextInput::make('amount_ngn')
                    ->required()
                    ->numeric(),
                TextInput::make('vat')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('wht')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                DatePicker::make('date')
                    ->required(),
                DatePicker::make('due_date'),
                TextInput::make('status')
                    ->required()
                    ->default('requested'),
                Select::make('receipt_file_id')
                    ->relationship('receiptFile', 'id'),
                Select::make('requested_by_id')
                    ->relationship('requestedBy', 'name')
                    ->required(),
                Select::make('approved_by_id')
                    ->relationship('approvedBy', 'name'),
                DateTimePicker::make('approved_at'),
                DateTimePicker::make('paid_at'),
            ]);
    }
}
