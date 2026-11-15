<?php

namespace App\Filament\Resources\Carriers;

use App\Filament\Resources\Carriers\Pages\CreateCarrier;
use App\Filament\Resources\Carriers\Pages\EditCarrier;
use App\Filament\Resources\Carriers\Pages\ListCarriers;
use App\Filament\Resources\Carriers\Schemas\CarrierForm;
use App\Filament\Resources\Carriers\Tables\CarriersTable;
use App\Models\Carrier;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;

class CarrierResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'telecom.carriers';

    protected static array $ownColumns = ['account_manager_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Telecom';

    protected static ?int $navigationSort = 1;

    protected static ?string $model = Carrier::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-signal';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return CarrierForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return CarriersTable::configure($table);
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
            'index' => ListCarriers::route('/'),
            'create' => CreateCarrier::route('/create'),
            'edit' => EditCarrier::route('/{record}/edit'),
        ];
    }

    public static function getRecordRouteBindingEloquentQuery(): Builder
    {
        return parent::getRecordRouteBindingEloquentQuery()
            ->withoutGlobalScopes([
                SoftDeletingScope::class,
            ]);
    }
}
