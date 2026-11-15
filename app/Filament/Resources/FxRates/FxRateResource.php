<?php

namespace App\Filament\Resources\FxRates;

use App\Filament\Resources\FxRates\Pages\ManageFxRates;
use App\Models\FxRate;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class FxRateResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'finance.income';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Money';

    protected static ?int $navigationSort = 6;

    protected static ?string $navigationLabel = 'Exchange rates';

    protected static ?string $model = FxRate::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-globe-alt';

    protected static ?string $recordTitleAttribute = 'currency';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('currency')
                    ->required(),
                DatePicker::make('date')
                    ->required(),
                TextInput::make('ngn_per_unit')
                    ->required()
                    ->numeric(),
                TextInput::make('basis')
                    ->required()
                    ->default('parallel'),
                Textarea::make('sources')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('status')
                    ->required()
                    ->default('accepted'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('currency')
            ->columns([
                TextColumn::make('currency')
                    ->searchable(),
                TextColumn::make('date')
                    ->date()
                    ->sortable(),
                TextColumn::make('ngn_per_unit')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('basis')
                    ->searchable(),
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
            'index' => ManageFxRates::route('/'),
        ];
    }
}
