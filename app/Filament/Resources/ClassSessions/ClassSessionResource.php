<?php

namespace App\Filament\Resources\ClassSessions;

use App\Filament\Resources\ClassSessions\Pages\ManageClassSessions;
use App\Models\ClassSession;
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

class ClassSessionResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'academy';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Academy';

    protected static ?int $navigationSort = 4;

    protected static ?string $model = ClassSession::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-calendar';

    protected static ?string $recordTitleAttribute = 'topic';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('cohort_id')
                    ->relationship('cohort', 'name')
                    ->required(),
                DateTimePicker::make('starts_at')
                    ->required(),
                TextInput::make('topic')
                    ->required(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('topic')
            ->columns([
                TextColumn::make('cohort.name')
                    ->searchable(),
                TextColumn::make('starts_at')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('topic')
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
            'index' => ManageClassSessions::route('/'),
        ];
    }
}
