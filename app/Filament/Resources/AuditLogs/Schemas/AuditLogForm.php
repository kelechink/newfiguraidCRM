<?php

namespace App\Filament\Resources\AuditLogs\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class AuditLogForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                DateTimePicker::make('at')
                    ->required(),
                TextInput::make('actor_id')
                    ->default(null),
                TextInput::make('actor_type')
                    ->required()
                    ->default('user'),
                TextInput::make('action')
                    ->required(),
                TextInput::make('entity_type')
                    ->default(null),
                TextInput::make('entity_id')
                    ->default(null),
                TextInput::make('unit_id')
                    ->default(null),
                Textarea::make('before')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('after')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('ip')
                    ->default(null),
            ]);
    }
}
