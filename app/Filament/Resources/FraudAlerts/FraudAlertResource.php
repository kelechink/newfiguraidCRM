<?php

namespace App\Filament\Resources\FraudAlerts;

use App\Filament\Resources\FraudAlerts\Pages\ManageFraudAlerts;
use App\Models\FraudAlert;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class FraudAlertResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'telecom.traffic';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Telecom';

    protected static ?int $navigationSort = 4;

    protected static ?string $model = FraudAlert::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-shield-exclamation';

    protected static ?string $recordTitleAttribute = 'summary';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('carrier_id')
                    ->relationship('carrier', 'name'),
                TextInput::make('kind')
                    ->required(),
                TextInput::make('severity')
                    ->required()
                    ->default('warning'),
                TextInput::make('summary')
                    ->required(),
                Textarea::make('data')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('status')
                    ->required()
                    ->default('open'),
                Select::make('handled_by_id')
                    ->relationship('handledBy', 'name'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('summary')
            ->columns([
                TextColumn::make('carrier.name')
                    ->searchable(),
                TextColumn::make('kind')
                    ->searchable(),
                TextColumn::make('severity')
                    ->searchable(),
                TextColumn::make('summary')
                    ->searchable(),
                TextColumn::make('status')
                    ->searchable(),
                TextColumn::make('handledBy.name')
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
            'index' => ManageFraudAlerts::route('/'),
        ];
    }
}
