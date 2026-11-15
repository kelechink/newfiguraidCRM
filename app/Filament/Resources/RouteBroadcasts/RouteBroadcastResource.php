<?php

namespace App\Filament\Resources\RouteBroadcasts;

use App\Filament\Resources\RouteBroadcasts\Pages\CreateRouteBroadcast;
use App\Filament\Resources\RouteBroadcasts\Pages\EditRouteBroadcast;
use App\Filament\Resources\RouteBroadcasts\Pages\ListRouteBroadcasts;
use App\Filament\Resources\RouteBroadcasts\Schemas\RouteBroadcastForm;
use App\Filament\Resources\RouteBroadcasts\Tables\RouteBroadcastsTable;
use App\Models\RouteBroadcast;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class RouteBroadcastResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'telecom.broadcasts';

    protected static array $ownColumns = ['created_by_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Telecom';

    protected static ?int $navigationSort = 5;

    protected static ?string $model = RouteBroadcast::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-megaphone';

    protected static ?string $recordTitleAttribute = 'subject';

    public static function form(Schema $schema): Schema
    {
        return RouteBroadcastForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return RouteBroadcastsTable::configure($table);
    }

    public static function getRelations(): array
    {
        return [
            //
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListRouteBroadcasts::route('/'),
            'create' => CreateRouteBroadcast::route('/create'),
            'edit' => EditRouteBroadcast::route('/{record}/edit'),
        ];
    }
}
