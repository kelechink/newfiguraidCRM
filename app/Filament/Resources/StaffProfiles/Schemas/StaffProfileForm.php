<?php

namespace App\Filament\Resources\StaffProfiles\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Schema;

class StaffProfileForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('user_id')
                    ->relationship('user', 'name')
                    ->required(),
                TextInput::make('employee_no')
                    ->required(),
                TextInput::make('job_title')
                    ->required(),
                TextInput::make('employment_type')
                    ->required()
                    ->default('full_time'),
                DatePicker::make('start_date')
                    ->required(),
                DatePicker::make('probation_ends'),
                TextInput::make('personal_email')
                    ->email()
                    ->default(null),
                TextInput::make('address')
                    ->default(null),
                Textarea::make('next_of_kin')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('salary')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('allowances')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('bank_name')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('bank_account')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('account_name')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('id_number')
                    ->default(null)
                    ->columnSpanFull(),
                Select::make('office_id')
                    ->relationship('office', 'name'),
                TextInput::make('resume_time')
                    ->required()
                    ->default('09:00'),
                TextInput::make('close_time')
                    ->required()
                    ->default('17:00'),
                Textarea::make('working_days')
                    ->required()
                    ->columnSpanFull(),
                TextInput::make('grace_minutes')
                    ->required()
                    ->numeric()
                    ->default(0),
                Toggle::make('remote_allowed')
                    ->required(),
                TextInput::make('lateness_policy_id')
                    ->default(null),
                DateTimePicker::make('onboarded_at'),
            ]);
    }
}
