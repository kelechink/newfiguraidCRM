<?php

namespace App\Filament\Resources\Goals\Schemas;

use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Schema;

class GoalForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('quarter')
                    ->required(),
                Select::make('unit_id')
                    ->relationship('unit', 'name'),
                TextInput::make('objective')
                    ->required(),
                Select::make('owner_id')
                    ->relationship('owner', 'name'),
            ]);
    }
}
