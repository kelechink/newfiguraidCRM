<?php

namespace App\Filament\Resources\Rfqs\Schemas;

use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Schemas\Schema;

class RfqForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('number')
                    ->required(),
                Select::make('contact_id')
                    ->relationship('contact', 'id'),
                Select::make('deal_id')
                    ->relationship('deal', 'title'),
                TextInput::make('title')
                    ->required(),
                Textarea::make('items')
                    ->required()
                    ->columnSpanFull(),
                DatePicker::make('needed_by'),
                TextInput::make('status')
                    ->required()
                    ->default('open'),
                Select::make('owner_id')
                    ->relationship('owner', 'name'),
            ]);
    }
}
