<?php

namespace App\Filament\Resources\TrainingCourses\Schemas;

use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Schema;

class TrainingCourseForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('title')
                    ->required(),
                Textarea::make('summary')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('body')
                    ->required()
                    ->columnSpanFull(),
                Textarea::make('quiz')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('pass_mark')
                    ->required()
                    ->numeric()
                    ->default(70),
                Toggle::make('required_for_new_staff')
                    ->required(),
                Toggle::make('is_active')
                    ->required(),
            ]);
    }
}
