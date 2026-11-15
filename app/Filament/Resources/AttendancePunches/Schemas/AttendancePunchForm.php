<?php

namespace App\Filament\Resources\AttendancePunches\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Schema;

class AttendancePunchForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('attendance_day_id')
                    ->relationship('attendanceDay', 'id')
                    ->required(),
                Select::make('user_id')
                    ->relationship('user', 'name')
                    ->required(),
                TextInput::make('type')
                    ->required(),
                DateTimePicker::make('device_time')
                    ->required(),
                DateTimePicker::make('server_time')
                    ->required(),
                TextInput::make('latitude')
                    ->numeric()
                    ->default(null),
                TextInput::make('longitude')
                    ->numeric()
                    ->default(null),
                TextInput::make('accuracy_m')
                    ->numeric()
                    ->default(null),
                TextInput::make('distance_m')
                    ->numeric()
                    ->default(null),
                Toggle::make('within_geofence')
                    ->required(),
                Select::make('office_id')
                    ->relationship('office', 'name'),
                TextInput::make('selfie_file_id')
                    ->default(null),
                Select::make('device_id')
                    ->relationship('device', 'id'),
                Textarea::make('flags')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('review_status')
                    ->required()
                    ->default('not_required'),
                Select::make('reviewed_by_id')
                    ->relationship('reviewedBy', 'name'),
                TextInput::make('review_note')
                    ->default(null),
                TextInput::make('ip')
                    ->default(null),
            ]);
    }
}
