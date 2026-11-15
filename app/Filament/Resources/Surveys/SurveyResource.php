<?php

namespace App\Filament\Resources\Surveys;

use App\Filament\Resources\Surveys\Pages\ManageSurveys;
use App\Models\Survey;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class SurveyResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'surveys';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = 'unit_id';

    protected static string|\UnitEnum|null $navigationGroup = 'Customers';

    protected static ?int $navigationSort = 6;

    protected static ?string $model = Survey::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-face-smile';

    protected static ?string $recordTitleAttribute = 'kind';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('kind')
                    ->required(),
                Select::make('contact_id')
                    ->relationship('contact', 'id'),
                Select::make('unit_id')
                    ->relationship('unit', 'name')
                    ->required(),
                TextInput::make('token')
                    ->required(),
                TextInput::make('score')
                    ->numeric()
                    ->default(null),
                Textarea::make('comment')
                    ->default(null)
                    ->columnSpanFull(),
                DateTimePicker::make('answered_at'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('kind')
            ->columns([
                TextColumn::make('kind')
                    ->searchable(),
                TextColumn::make('contact.id')
                    ->searchable(),
                TextColumn::make('unit.name')
                    ->searchable(),
                TextColumn::make('token')
                    ->searchable(),
                TextColumn::make('score')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('answered_at')
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
            'index' => ManageSurveys::route('/'),
        ];
    }
}
