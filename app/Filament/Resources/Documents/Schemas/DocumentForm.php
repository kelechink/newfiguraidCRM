<?php

namespace App\Filament\Resources\Documents\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Schema;

class DocumentForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('unit_id')
                    ->relationship('unit', 'name'),
                TextInput::make('title')
                    ->required(),
                TextInput::make('kind')
                    ->required(),
                Select::make('file_id')
                    ->relationship('file', 'id'),
                DatePicker::make('expires_on'),
                TextInput::make('remind_days_before')
                    ->required()
                    ->numeric()
                    ->default(30),
                Select::make('owner_id')
                    ->relationship('owner', 'name'),
                TextInput::make('confidentiality')
                    ->required()
                    ->default('internal'),
            ]);
    }
}
