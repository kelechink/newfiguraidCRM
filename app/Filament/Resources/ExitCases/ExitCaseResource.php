<?php

namespace App\Filament\Resources\ExitCases;

use App\Filament\Resources\ExitCases\Pages\CreateExitCase;
use App\Filament\Resources\ExitCases\Pages\EditExitCase;
use App\Filament\Resources\ExitCases\Pages\ListExitCases;
use App\Filament\Resources\ExitCases\Schemas\ExitCaseForm;
use App\Filament\Resources\ExitCases\Tables\ExitCasesTable;
use App\Models\ExitCase;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class ExitCaseResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'hr.staff';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 10;

    protected static ?string $model = ExitCase::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-arrow-right-on-rectangle';

    protected static ?string $recordTitleAttribute = 'type';

    public static function form(Schema $schema): Schema
    {
        return ExitCaseForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return ExitCasesTable::configure($table);
    }

    public static function getRelations(): array
    {
        return [
            //
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListExitCases::route('/'),
            'create' => CreateExitCase::route('/create'),
            'edit' => EditExitCase::route('/{record}/edit'),
        ];
    }
}
