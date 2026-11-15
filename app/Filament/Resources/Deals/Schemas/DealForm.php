<?php

namespace App\Filament\Resources\Deals\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class DealForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('unit_id')
                    ->relationship('unit', 'name')
                    ->required(),
                Select::make('pipeline_id')
                    ->relationship('pipeline', 'name')
                    ->required(),
                Select::make('stage_id')
                    ->relationship('stage', 'name')
                    ->required(),
                Select::make('contact_id')
                    ->relationship('contact', 'id'),
                Select::make('company_id')
                    ->relationship('company', 'name'),
                Select::make('owner_id')
                    ->relationship('owner', 'name'),
                TextInput::make('title')
                    ->required(),
                TextInput::make('value')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('currency')
                    ->required()
                    ->default('NGN'),
                TextInput::make('status')
                    ->required()
                    ->default('open'),
                DatePicker::make('expected_close_on'),
                TextInput::make('next_action')
                    ->default(null),
                DatePicker::make('next_action_on'),
                Textarea::make('tags')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('source')
                    ->default(null),
                Select::make('lost_reason_id')
                    ->relationship('lostReason', 'id')
                    ->default(null),
                Textarea::make('lost_note')
                    ->default(null)
                    ->columnSpanFull(),
                DateTimePicker::make('won_at'),
                DateTimePicker::make('lost_at'),
            ]);
    }
}
