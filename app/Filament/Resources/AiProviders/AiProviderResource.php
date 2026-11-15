<?php

namespace App\Filament\Resources\AiProviders;

use App\Filament\Resources\AiProviders\Pages\ManageAiProviders;
use App\Models\AiProvider;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class AiProviderResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'ai.usage';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'AI team';

    protected static ?int $navigationSort = 3;

    protected static ?string $navigationLabel = 'AI providers';

    protected static ?string $model = AiProvider::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-cpu-chip';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('key')
                    ->required(),
                TextInput::make('name')
                    ->required(),
                TextInput::make('priority')
                    ->required()
                    ->numeric(),
                TextInput::make('light_model')
                    ->required(),
                TextInput::make('heavy_model')
                    ->required(),
                Toggle::make('is_enabled')
                    ->required(),
                TextInput::make('daily_limit')
                    ->numeric()
                    ->default(null),
                DateTimePicker::make('cooldown_until'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('name')
            ->columns([
                TextColumn::make('key')
                    ->searchable(),
                TextColumn::make('name')
                    ->searchable(),
                TextColumn::make('priority')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('light_model')
                    ->searchable(),
                TextColumn::make('heavy_model')
                    ->searchable(),
                IconColumn::make('is_enabled')
                    ->boolean(),
                TextColumn::make('daily_limit')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('cooldown_until')
                    ->dateTime()
                    ->sortable()
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
            'index' => ManageAiProviders::route('/'),
        ];
    }
}
