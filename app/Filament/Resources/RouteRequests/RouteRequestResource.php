<?php

namespace App\Filament\Resources\RouteRequests;

use App\Filament\Resources\RouteRequests\Pages\ManageRouteRequests;
use App\Models\RouteRequest;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class RouteRequestResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'telecom.routes';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Telecom';

    protected static ?int $navigationSort = 8;

    protected static ?string $model = RouteRequest::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-arrow-path';

    protected static ?string $recordTitleAttribute = 'destination';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('carrier_id')
                    ->relationship('carrier', 'name')
                    ->required(),
                TextInput::make('destination')
                    ->required(),
                TextInput::make('volume')
                    ->default(null),
                TextInput::make('target_rate')
                    ->numeric()
                    ->default(null),
                TextInput::make('status')
                    ->required()
                    ->default('new'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('destination')
            ->columns([
                TextColumn::make('carrier.name')
                    ->searchable(),
                TextColumn::make('destination')
                    ->searchable(),
                TextColumn::make('volume')
                    ->searchable(),
                TextColumn::make('target_rate')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('status')
                    ->searchable(),
            ])
            ->filters([
                //
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageRouteRequests::route('/'),
        ];
    }
}
