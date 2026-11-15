<?php

namespace App\Filament\Resources\RouteBroadcasts\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class RouteBroadcastForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('subject')
                    ->required(),
                Textarea::make('body')
                    ->required()
                    ->columnSpanFull(),
                Select::make('rate_deck_id')
                    ->relationship('rateDeck', 'name'),
                Textarea::make('recipient_carrier_ids')
                    ->required()
                    ->columnSpanFull(),
                TextInput::make('status')
                    ->required()
                    ->default('draft'),
                Select::make('created_by_id')
                    ->relationship('createdBy', 'name')
                    ->required(),
                Select::make('approved_by_id')
                    ->relationship('approvedBy', 'name'),
                DateTimePicker::make('sent_at'),
            ]);
    }
}
