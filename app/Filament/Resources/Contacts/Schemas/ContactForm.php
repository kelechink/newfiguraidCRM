<?php

namespace App\Filament\Resources\Contacts\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class ContactForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('primary_unit_id')
                    ->relationship('primaryUnit', 'name')
                    ->required(),
                Select::make('owner_id')
                    ->relationship('owner', 'name'),
                Select::make('company_id')
                    ->relationship('company', 'name'),
                TextInput::make('first_name')
                    ->default(null),
                TextInput::make('last_name')
                    ->default(null),
                TextInput::make('display_name')
                    ->required(),
                TextInput::make('email')
                    ->label('Email address')
                    ->email()
                    ->default(null),
                TextInput::make('phone')
                    ->tel()
                    ->default(null),
                TextInput::make('whatsapp_id')
                    ->default(null),
                TextInput::make('teams_handle')
                    ->default(null),
                DatePicker::make('birthday'),
                TextInput::make('lifecycle')
                    ->required()
                    ->default('lead'),
                TextInput::make('score')
                    ->required()
                    ->numeric()
                    ->default(0),
                TextInput::make('health_score')
                    ->numeric()
                    ->default(null),
                TextInput::make('budget')
                    ->numeric()
                    ->default(null),
                TextInput::make('source_channel')
                    ->default(null),
                TextInput::make('source_detail')
                    ->default(null),
                Textarea::make('tags')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('destinations')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('utm_source')
                    ->default(null),
                TextInput::make('utm_medium')
                    ->default(null),
                TextInput::make('utm_campaign')
                    ->default(null),
                TextInput::make('referral_code')
                    ->default(null),
                TextInput::make('whmcs_client_id')
                    ->default(null),
                DateTimePicker::make('last_activity_at'),
            ]);
    }
}
