<?php

namespace App\Filament\Resources\TaxRecords;

use App\Filament\Resources\TaxRecords\Pages\ManageTaxRecords;
use App\Models\TaxRecord;
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

class TaxRecordResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'finance.reports';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Money';

    protected static ?int $navigationSort = 8;

    protected static ?string $model = TaxRecord::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-calculator';

    protected static ?string $recordTitleAttribute = 'kind';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('kind')
                    ->required(),
                TextInput::make('period_month')
                    ->required(),
                TextInput::make('amount')
                    ->required()
                    ->numeric(),
                TextInput::make('direction')
                    ->required(),
                TextInput::make('status')
                    ->required()
                    ->default('open'),
                TextInput::make('reference')
                    ->default(null),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('kind')
            ->columns([
                TextColumn::make('kind')
                    ->searchable(),
                TextColumn::make('period_month')
                    ->searchable(),
                TextColumn::make('amount')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('direction')
                    ->searchable(),
                TextColumn::make('status')
                    ->searchable(),
                TextColumn::make('reference')
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
            'index' => ManageTaxRecords::route('/'),
        ];
    }
}
