<?php

namespace App\Filament\Resources\Enrolments\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Schema;

class EnrolmentForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('cohort_id')
                    ->relationship('cohort', 'name')
                    ->required(),
                Select::make('contact_id')
                    ->relationship('contact', 'id')
                    ->required(),
                TextInput::make('status')
                    ->required()
                    ->default('enrolled'),
                TextInput::make('fee')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('scholarship_pct')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('amount_paid')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('paystack_reference')
                    ->default(null),
                TextInput::make('attendance_pct')
                    ->numeric()
                    ->default(null),
                TextInput::make('certificate_code')
                    ->default(null),
                DateTimePicker::make('certificate_issued_at'),
            ]);
    }
}
