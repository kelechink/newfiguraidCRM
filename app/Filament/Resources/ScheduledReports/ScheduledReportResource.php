<?php

namespace App\Filament\Resources\ScheduledReports;

use App\Filament\Resources\ScheduledReports\Pages\ManageScheduledReports;
use App\Models\ScheduledReport;
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

class ScheduledReportResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'reports.builder';

    protected static array $ownColumns = ['owner_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Admin';

    protected static ?int $navigationSort = 8;

    protected static ?string $model = ScheduledReport::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-envelope';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->required(),
                TextInput::make('report')
                    ->required(),
                TextInput::make('frequency')
                    ->required(),
                Textarea::make('recipients')
                    ->required()
                    ->columnSpanFull(),
                Select::make('owner_id')
                    ->relationship('owner', 'name')
                    ->required(),
                DateTimePicker::make('last_sent_at'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('name')
            ->columns([
                TextColumn::make('name')
                    ->searchable(),
                TextColumn::make('report')
                    ->searchable(),
                TextColumn::make('frequency')
                    ->searchable(),
                TextColumn::make('owner.name')
                    ->searchable(),
                TextColumn::make('last_sent_at')
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
            'index' => ManageScheduledReports::route('/'),
        ];
    }
}
