<?php

namespace App\Filament\Resources\Targets;

use App\Filament\Resources\Targets\Pages\ManageTargets;
use App\Models\Target;
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

class TargetResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'targets';

    protected static array $ownColumns = ['user_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Today';

    protected static ?int $navigationSort = 5;

    protected static ?string $model = Target::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-trophy';

    protected static ?string $recordTitleAttribute = 'label';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('user_id')
                    ->relationship('user', 'name')
                    ->required(),
                Select::make('key_result_id')
                    ->relationship('keyResult', 'title'),
                DatePicker::make('week_start')
                    ->required(),
                TextInput::make('metric')
                    ->required(),
                TextInput::make('label')
                    ->default(null),
                TextInput::make('target')
                    ->required()
                    ->numeric(),
                TextInput::make('achieved')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                Select::make('set_by_id')
                    ->relationship('setBy', 'name'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('label')
            ->columns([
                TextColumn::make('user.name')
                    ->searchable(),
                TextColumn::make('keyResult.title')
                    ->searchable(),
                TextColumn::make('week_start')
                    ->date()
                    ->sortable(),
                TextColumn::make('metric')
                    ->searchable(),
                TextColumn::make('label')
                    ->searchable(),
                TextColumn::make('target')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('achieved')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('setBy.name')
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
            'index' => ManageTargets::route('/'),
        ];
    }
}
