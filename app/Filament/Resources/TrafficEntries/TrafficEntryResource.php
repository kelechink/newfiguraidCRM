<?php

namespace App\Filament\Resources\TrafficEntries;

use App\Filament\Resources\TrafficEntries\Pages\ManageTrafficEntries;
use App\Models\TrafficEntry;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class TrafficEntryResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'telecom.traffic';

    protected static array $ownColumns = ['entered_by_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Telecom';

    protected static ?int $navigationSort = 3;

    protected static ?string $navigationLabel = 'Traffic & minutes';

    protected static ?string $model = TrafficEntry::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-chart-bar';

    protected static ?string $recordTitleAttribute = 'destination';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                DatePicker::make('date')
                    ->required(),
                Select::make('customer_carrier_id')
                    ->relationship('customerCarrier', 'name')
                    ->required(),
                Select::make('vendor_carrier_id')
                    ->relationship('vendorCarrier', 'name'),
                TextInput::make('destination')
                    ->required(),
                TextInput::make('prefix')
                    ->default(null),
                TextInput::make('minutes')
                    ->required()
                    ->numeric(),
                TextInput::make('attempts')
                    ->numeric()
                    ->default(null),
                TextInput::make('connected')
                    ->numeric()
                    ->default(null),
                TextInput::make('sell_rate')
                    ->numeric()
                    ->default(null),
                TextInput::make('buy_rate')
                    ->numeric()
                    ->default(null),
                TextInput::make('currency')
                    ->required()
                    ->default('USD'),
                TextInput::make('revenue')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('cost')
                    ->required()
                    ->numeric()
                    ->default(0.0)
                    ->prefix('$'),
                TextInput::make('source')
                    ->required()
                    ->default('manual'),
                Select::make('entered_by_id')
                    ->relationship('enteredBy', 'name'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('destination')
            ->columns([
                TextColumn::make('date')
                    ->date()
                    ->sortable(),
                TextColumn::make('customerCarrier.name')
                    ->searchable(),
                TextColumn::make('vendorCarrier.name')
                    ->searchable(),
                TextColumn::make('destination')
                    ->searchable(),
                TextColumn::make('prefix')
                    ->searchable(),
                TextColumn::make('minutes')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('attempts')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('connected')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('sell_rate')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('buy_rate')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('currency')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('revenue')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('cost')
                    ->money()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('source')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('enteredBy.name')
                    ->searchable()
                    ->toggleable(isToggledHiddenByDefault: true),
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
            'index' => ManageTrafficEntries::route('/'),
        ];
    }
}
