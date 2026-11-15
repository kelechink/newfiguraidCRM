<?php

namespace App\Filament\Resources\Cohorts\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Schema;

class CohortForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('course_id')
                    ->relationship('course', 'title')
                    ->required(),
                TextInput::make('name')
                    ->required(),
                DatePicker::make('starts_on')
                    ->required(),
                DatePicker::make('ends_on'),
                TextInput::make('capacity')
                    ->required()
                    ->numeric()
                    ->default(30),
                Select::make('coordinator_id')
                    ->relationship('coordinator', 'name'),
            ]);
    }
}
