<?php

namespace App\Filament\Resources\AiAgents\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class AiAgentForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('key')
                    ->required(),
                TextInput::make('name')
                    ->required(),
                TextInput::make('role')
                    ->required(),
                TextInput::make('color')
                    ->required(),
                Textarea::make('brief')
                    ->required()
                    ->columnSpanFull(),
                Textarea::make('units')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('approval_required')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('status')
                    ->required()
                    ->default('active'),
                DateTimePicker::make('last_active_at'),
                TextInput::make('last_action')
                    ->default(null),
            ]);
    }
}
