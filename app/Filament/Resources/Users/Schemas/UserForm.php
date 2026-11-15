<?php

namespace App\Filament\Resources\Users\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class UserForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->required(),
                TextInput::make('email')
                    ->label('Email address')
                    ->email()
                    ->required(),
                TextInput::make('phone')
                    ->tel()
                    ->default(null),
                TextInput::make('password')
                    ->password()
                    ->required(),
                TextInput::make('status')
                    ->required()
                    ->default('invited'),
                Select::make('role_id')
                    ->relationship('role', 'name')
                    ->required(),
                Select::make('primary_unit_id')
                    ->relationship('primaryUnit', 'name'),
                TextInput::make('avatar_path')
                    ->default(null),
                Textarea::make('ip_allowlist')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('quiet_hours')
                    ->default(null),
                DatePicker::make('birthday'),
                DateTimePicker::make('access_expires_at'),
                DateTimePicker::make('contract_signed_at'),
                TextInput::make('privacy_policy_version')
                    ->default(null),
            ]);
    }
}
