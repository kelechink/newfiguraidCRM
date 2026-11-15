<?php

namespace App\Filament\Resources\MarginRules;

use App\Filament\Resources\MarginRules\Pages\ManageMarginRules;
use App\Models\MarginRule;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class MarginRuleResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'telecom.margins';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Telecom';

    protected static ?int $navigationSort = 7;

    protected static ?string $model = MarginRule::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-adjustments-horizontal';

    protected static ?string $recordTitleAttribute = 'service';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('service')
                    ->required()
                    ->default('voice'),
                TextInput::make('prefix')
                    ->default(null),
                TextInput::make('min_margin_pct')
                    ->required()
                    ->numeric()
                    ->default(5.0),
                TextInput::make('target_margin_pct')
                    ->required()
                    ->numeric()
                    ->default(10.0),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('service')
            ->columns([
                TextColumn::make('service')
                    ->searchable(),
                TextColumn::make('prefix')
                    ->searchable(),
                TextColumn::make('min_margin_pct')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('target_margin_pct')
                    ->numeric()
                    ->sortable(),
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
            'index' => ManageMarginRules::route('/'),
        ];
    }
}
