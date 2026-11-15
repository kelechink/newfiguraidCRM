<?php

namespace App\Filament\Resources\UptimeChecks;

use App\Filament\Resources\UptimeChecks\Pages\ManageUptimeChecks;
use App\Models\UptimeCheck;
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

class UptimeCheckResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'monitoring';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Admin';

    protected static ?int $navigationSort = 7;

    protected static ?string $model = UptimeCheck::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-signal';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->required(),
                TextInput::make('url')
                    ->url()
                    ->required(),
                Toggle::make('is_up'),
                TextInput::make('last_status')
                    ->numeric()
                    ->default(null),
                TextInput::make('last_ms')
                    ->numeric()
                    ->default(null),
                DateTimePicker::make('last_checked_at'),
                DateTimePicker::make('down_since'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('name')
            ->columns([
                TextColumn::make('name')
                    ->searchable(),
                TextColumn::make('url')
                    ->searchable(),
                IconColumn::make('is_up')
                    ->boolean(),
                TextColumn::make('last_status')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('last_ms')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('last_checked_at')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('down_since')
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
            'index' => ManageUptimeChecks::route('/'),
        ];
    }
}
