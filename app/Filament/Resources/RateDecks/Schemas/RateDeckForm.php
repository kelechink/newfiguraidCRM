<?php

namespace App\Filament\Resources\RateDecks\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class RateDeckForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('carrier_id')
                    ->relationship('carrier', 'name')
                    ->required(),
                \Filament\Forms\Components\Select::make('direction')->options(['sell' => 'Sell', 'buy' => 'Buy'])->required(),
                \Filament\Forms\Components\Select::make('route_type')->options(\App\Services\RateDeckService::ROUTE_TYPES)->default('cli')->required(),
                TextInput::make('name')
                    ->required(),
                TextInput::make('currency')
                    ->required()
                    ->default('USD'),
                DatePicker::make('effective_from')
                    ->required(),
                TextInput::make('source')
                    ->required()
                    ->default('upload'),
                Select::make('file_id')
                    ->relationship('file', 'id'),
                TextInput::make('status')
                    ->required()
                    ->default('draft'),
                Textarea::make('validation')
                    ->default(null)
                    ->columnSpanFull(),
                Select::make('approved_by_id')
                    ->relationship('approvedBy', 'name'),
                DateTimePicker::make('approved_at'),
            ]);
    }
}
