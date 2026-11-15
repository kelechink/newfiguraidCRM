<?php

namespace App\Filament\Resources\ExitCases\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class ExitCaseForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('user_id')
                    ->relationship('user', 'name')
                    ->required(),
                TextInput::make('type')
                    ->required(),
                DatePicker::make('notice_date')
                    ->required(),
                DatePicker::make('last_working_day')
                    ->required(),
                Textarea::make('reason')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('checklist')
                    ->required()
                    ->columnSpanFull(),
                Textarea::make('final_pay')
                    ->default(null)
                    ->columnSpanFull(),
                DateTimePicker::make('access_revoked_at'),
                TextInput::make('status')
                    ->required()
                    ->default('open'),
                Select::make('handled_by_id')
                    ->relationship('handledBy', 'name')
                    ->required(),
            ]);
    }
}
