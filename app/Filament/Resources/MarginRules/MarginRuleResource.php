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
                \Filament\Forms\Components\Select::make('service')->label('Route type')->options(\App\Services\RateDeckService::ROUTE_TYPES)->required(),
                TextInput::make('prefix')->helperText('Blank = default for the route type; enter a prefix to override one destination.'),
                TextInput::make('min_margin_pct')->label('Minimum margin % (blank = no fixed minimum)')->numeric(),
                TextInput::make('target_margin_pct')->label('Target margin % for the deck builder')->numeric(),
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
