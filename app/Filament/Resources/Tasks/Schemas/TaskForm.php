<?php

namespace App\Filament\Resources\Tasks\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class TaskForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('unit_id')
                    ->relationship('unit', 'name'),
                TextInput::make('title')
                    ->required(),
                Textarea::make('description')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('status')
                    ->required()
                    ->default('todo'),
                TextInput::make('priority')
                    ->required()
                    ->default('medium'),
                TextInput::make('origin')
                    ->required()
                    ->default('team_lead'),
                TextInput::make('agent_key')
                    ->default(null),
                Select::make('assignee_id')
                    ->relationship('assignee', 'name'),
                Select::make('creator_id')
                    ->relationship('creator', 'name'),
                DateTimePicker::make('due_at'),
                DateTimePicker::make('completed_at'),
                Textarea::make('checklist')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('tags')
                    ->default(null)
                    ->columnSpanFull(),
                Select::make('playbook_id')
                    ->relationship('playbook', 'title'),
                TextInput::make('contact_id')
                    ->default(null),
                TextInput::make('deal_id')
                    ->default(null),
                TextInput::make('ticket_id')
                    ->default(null),
                TextInput::make('conversation_id')
                    ->default(null),
            ]);
    }
}
