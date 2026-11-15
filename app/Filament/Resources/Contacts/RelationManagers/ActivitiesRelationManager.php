<?php

namespace App\Filament\Resources\Contacts\RelationManagers;

use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/** Activity feed on the single customer profile. */
class ActivitiesRelationManager extends RelationManager
{
    protected static string $relationship = 'activities';

    protected static ?string $title = 'Activity';

    public function table(Table $table): Table
    {
        return $table->defaultSort('occurred_at', 'desc')->columns([
            TextColumn::make('occurred_at')->dateTime('j M Y H:i')->label('When'),
            TextColumn::make('type')->badge(),
            TextColumn::make('summary')->wrap()->limit(200),
            TextColumn::make('actor.name')->label('By')->placeholder(fn ($record) => $record->agent_key ? 'AI agent' : 'System'),
        ]);
    }
}
