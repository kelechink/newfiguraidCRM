<?php

namespace App\Filament\Resources\RateDecks\RelationManagers;

use App\Authz\Access;
use App\Services\RateDeckService;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TextInput;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/** Review and adjust a deck's rates before approval. Sell decks show cost and margin to margin holders only. */
class RatesRelationManager extends RelationManager
{
    protected static string $relationship = 'rates';

    public function form(Schema $schema): Schema
    {
        return $schema->components([TextInput::make('rate')->label('Rate per minute / message')->numeric()->required()]);
    }

    public function table(Table $table): Table
    {
        $deck = $this->getOwnerRecord();
        $showCost = $deck->direction === 'sell' && Access::can(auth()->user(), 'telecom.margins');
        $cost = $showCost ? RateDeckService::bestBuy($deck->rates()->pluck('prefix')->all(), $deck->currency, $deck->route_type) : [];

        return $table->defaultSort('destination')->columns([
            TextColumn::make('destination')->searchable(),
            TextColumn::make('prefix')->searchable(),
            TextColumn::make('rate')->numeric(6),
            TextColumn::make('cost')->label('Best buy')->state(fn ($record) => isset($cost[$record->prefix]) ? round($cost[$record->prefix], 6) : '—')->visible($showCost),
            TextColumn::make('margin')->label('Margin')->visible($showCost)
                ->state(fn ($record) => isset($cost[$record->prefix]) && $record->rate > 0 ? round(($record->rate - $cost[$record->prefix]) / $record->rate * 100, 2).'%' : '—')
                ->color(fn ($record) => isset($cost[$record->prefix]) && $record->rate < $cost[$record->prefix] ? 'danger' : null),
            TextColumn::make('effective_from')->date(),
        ])->recordActions([
            EditAction::make()->visible(fn () => in_array($deck->status, ['draft', 'blocked']) && Access::can(auth()->user(), 'telecom.routes', 'edit')),
        ]);
    }
}
