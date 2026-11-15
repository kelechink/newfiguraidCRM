<?php

namespace App\Filament\Resources\Tickets\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class TicketForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('unit_id')
                    ->relationship('unit', 'name')
                    ->required(),
                TextInput::make('number')
                    ->required(),
                Select::make('contact_id')
                    ->relationship('contact', 'id'),
                Select::make('conversation_id')
                    ->relationship('conversation', 'id'),
                TextInput::make('subject')
                    ->required(),
                Textarea::make('body')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('status')
                    ->required()
                    ->default('open'),
                TextInput::make('priority')
                    ->required()
                    ->default('normal'),
                Select::make('assignee_id')
                    ->relationship('assignee', 'name'),
                TextInput::make('external_ref')
                    ->default(null),
                DateTimePicker::make('due_at'),
                DateTimePicker::make('resolved_at'),
            ]);
    }
}
