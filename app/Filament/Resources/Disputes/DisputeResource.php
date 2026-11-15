<?php

namespace App\Filament\Resources\Disputes;

use App\Filament\Resources\Disputes\Pages\ManageDisputes;
use App\Models\Dispute;
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

class DisputeResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'telecom.disputes';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Telecom';

    protected static ?int $navigationSort = 6;

    protected static ?string $model = Dispute::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-scale';

    protected static ?string $recordTitleAttribute = 'period';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('carrier_id')
                    ->relationship('carrier', 'name')
                    ->required(),
                TextInput::make('invoice_id')
                    ->default(null),
                TextInput::make('period')
                    ->required(),
                TextInput::make('our_amount')
                    ->required()
                    ->numeric(),
                TextInput::make('their_amount')
                    ->required()
                    ->numeric(),
                TextInput::make('currency')
                    ->required(),
                Textarea::make('notes')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('status')
                    ->required()
                    ->default('open'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('period')
            ->columns([
                TextColumn::make('carrier.name')
                    ->searchable(),
                TextColumn::make('invoice_id')
                    ->searchable(),
                TextColumn::make('period')
                    ->searchable(),
                TextColumn::make('our_amount')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('their_amount')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('currency')
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
            'index' => ManageDisputes::route('/'),
        ];
    }
}
