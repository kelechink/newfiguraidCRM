<?php

namespace App\Filament\Resources\Playbooks\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Schema;

class PlaybookForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('unit_id')
                    ->relationship('unit', 'name')
                    ->required(),
                Select::make('owner_id')
                    ->relationship('owner', 'name'),
                TextInput::make('title')
                    ->required(),
                Textarea::make('body')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('steps')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('frequency')
                    ->required()
                    ->default('on_demand'),
                Textarea::make('weekdays')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('day_of_month')
                    ->numeric()
                    ->default(null),
                TextInput::make('due_time')
                    ->required()
                    ->default('17:00'),
                TextInput::make('default_priority')
                    ->required()
                    ->default('medium'),
                DatePicker::make('starts_on'),
                Toggle::make('is_active')
                    ->required(),
            ]);
    }
}
