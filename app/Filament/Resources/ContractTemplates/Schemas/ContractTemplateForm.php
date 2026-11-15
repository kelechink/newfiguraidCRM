<?php

namespace App\Filament\Resources\ContractTemplates\Schemas;

use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Schema;

class ContractTemplateForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('kind')
                    ->required(),
                TextInput::make('version')
                    ->required()
                    ->numeric(),
                TextInput::make('title')
                    ->required(),
                Textarea::make('body')
                    ->required()
                    ->columnSpanFull(),
                TextInput::make('status')
                    ->required()
                    ->default('draft'),
                Toggle::make('in_pack')
                    ->required(),
                TextInput::make('lawyer_name')
                    ->default(null),
                DateTimePicker::make('lawyer_reviewed_at'),
            ]);
    }
}
