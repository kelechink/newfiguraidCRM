<?php

namespace App\Filament\Resources\ContractPacks;

use App\Filament\Resources\ContractPacks\Pages\ManageContractPacks;
use App\Models\ContractPack;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class ContractPackResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'hr.contracts';

    protected static array $ownColumns = ['user_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 9;

    protected static ?string $model = ContractPack::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-pencil';

    protected static ?string $recordTitleAttribute = 'purpose';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('user_id')
                    ->relationship('user', 'name')
                    ->required(),
                TextInput::make('purpose')
                    ->required()
                    ->default('onboarding'),
                TextInput::make('status')
                    ->required()
                    ->default('sent'),
                DateTimePicker::make('sent_at'),
                TextInput::make('reminder_count')
                    ->required()
                    ->numeric()
                    ->default(0),
                DateTimePicker::make('last_reminder_at'),
                DateTimePicker::make('completed_at'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('purpose')
            ->columns([
                TextColumn::make('user.name')
                    ->searchable(),
                TextColumn::make('purpose')
                    ->searchable(),
                TextColumn::make('status')
                    ->searchable(),
                TextColumn::make('sent_at')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('reminder_count')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('last_reminder_at')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('completed_at')
                    ->dateTime()
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
            'index' => ManageContractPacks::route('/'),
        ];
    }
}
