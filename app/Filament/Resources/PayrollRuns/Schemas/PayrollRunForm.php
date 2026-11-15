<?php

namespace App\Filament\Resources\PayrollRuns\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class PayrollRunForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('period_month')
                    ->required(),
                TextInput::make('status')
                    ->required()
                    ->default('draft'),
                Textarea::make('total_gross')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('total_net')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('staff_count')
                    ->required()
                    ->numeric()
                    ->default(0),
                Select::make('prepared_by_id')
                    ->relationship('preparedBy', 'name')
                    ->required(),
                Select::make('approved_by_id')
                    ->relationship('approvedBy', 'name'),
                DateTimePicker::make('approved_at'),
                Select::make('signed_off_by_id')
                    ->relationship('signedOffBy', 'name'),
                DateTimePicker::make('signed_off_at'),
                DateTimePicker::make('paid_at'),
            ]);
    }
}
