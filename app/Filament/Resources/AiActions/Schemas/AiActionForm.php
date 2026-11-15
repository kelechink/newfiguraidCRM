<?php

namespace App\Filament\Resources\AiActions\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class AiActionForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('agent_key')
                    ->required(),
                TextInput::make('kind')
                    ->required(),
                TextInput::make('subject_type')
                    ->default(null),
                TextInput::make('subject_id')
                    ->default(null),
                Textarea::make('input_summary')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('output')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('status')
                    ->required()
                    ->default('done'),
                Select::make('decided_by_id')
                    ->relationship('decidedBy', 'name'),
                DateTimePicker::make('decided_at'),
                TextInput::make('quality_score')
                    ->numeric()
                    ->default(null),
                TextInput::make('provider')
                    ->default(null),
            ]);
    }
}
