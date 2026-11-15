<?php

namespace App\Filament\Resources\RateDecks;

use App\Filament\Resources\RateDecks\Pages\CreateRateDeck;
use App\Filament\Resources\RateDecks\Pages\EditRateDeck;
use App\Filament\Resources\RateDecks\Pages\ListRateDecks;
use App\Filament\Resources\RateDecks\Schemas\RateDeckForm;
use App\Filament\Resources\RateDecks\Tables\RateDecksTable;
use App\Models\RateDeck;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class RateDeckResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'telecom.routes';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Telecom';

    protected static ?int $navigationSort = 2;

    protected static ?string $model = RateDeck::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-table-cells';

    protected static ?string $recordTitleAttribute = 'name';

    /** Vendor buy rates are sensitive: only holders of telecom.buy_rates see buy decks. */
    public static function getEloquentQuery(): \Illuminate\Database\Eloquent\Builder
    {
        $q = \App\Authz\Access::scopeQuery(parent::getEloquentQuery(), auth()->user(), static::$module, static::$ownColumns, static::$unitColumn);

        return \App\Authz\Access::can(auth()->user(), 'telecom.buy_rates') ? $q : $q->where('direction', 'sell');
    }

    public static function form(Schema $schema): Schema
    {
        return RateDeckForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return RateDecksTable::configure($table);
    }

    public static function getRelations(): array
    {
        return [
            RelationManagers\RatesRelationManager::class,
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListRateDecks::route('/'),
            'create' => CreateRateDeck::route('/create'),
            'edit' => EditRateDeck::route('/{record}/edit'),
        ];
    }
}
