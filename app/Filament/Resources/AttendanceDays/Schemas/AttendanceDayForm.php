<?php

namespace App\Filament\Resources\AttendanceDays\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Schema;

class AttendanceDayForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('user_id')
                    ->relationship('user', 'name')
                    ->required(),
                DatePicker::make('date')
                    ->required(),
                TextInput::make('status')
                    ->required()
                    ->default('pending'),
                DateTimePicker::make('first_in_at'),
                DateTimePicker::make('last_out_at'),
                TextInput::make('minutes_late')
                    ->required()
                    ->numeric()
                    ->default(0),
                TextInput::make('minutes_early')
                    ->required()
                    ->numeric()
                    ->default(0),
                Toggle::make('missing_clock_out')
                    ->required(),
                TextInput::make('worked_minutes')
                    ->required()
                    ->numeric()
                    ->default(0),
                Toggle::make('is_flagged')
                    ->required(),
                DateTimePicker::make('payroll_locked_at'),
            ]);
    }
}
