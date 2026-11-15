<?php

namespace App\Filament\Resources\Conversations\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class ConversationForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('unit_id')
                    ->relationship('unit', 'name')
                    ->required(),
                Select::make('contact_id')
                    ->relationship('contact', 'id'),
                TextInput::make('channel')
                    ->required(),
                TextInput::make('channel_account')
                    ->default(null),
                TextInput::make('external_thread_id')
                    ->default(null),
                TextInput::make('subject')
                    ->default(null),
                TextInput::make('status')
                    ->required()
                    ->default('open'),
                TextInput::make('category')
                    ->default(null),
                TextInput::make('priority')
                    ->required()
                    ->default('normal'),
                Select::make('assignee_id')
                    ->relationship('assignee', 'name'),
                TextInput::make('agent_key')
                    ->default(null),
                DateTimePicker::make('last_customer_message_at'),
                DateTimePicker::make('first_response_at'),
                DateTimePicker::make('sla_due_at'),
                TextInput::make('escalation_level')
                    ->required()
                    ->numeric()
                    ->default(0),
                Textarea::make('resolution_note')
                    ->default(null)
                    ->columnSpanFull(),
                DateTimePicker::make('resolved_at'),
            ]);
    }
}
