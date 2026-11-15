<?php

namespace App\Filament\Resources\Cohorts;

use App\Filament\Resources\Cohorts\Pages\CreateCohort;
use App\Filament\Resources\Cohorts\Pages\EditCohort;
use App\Filament\Resources\Cohorts\Pages\ListCohorts;
use App\Filament\Resources\Cohorts\Schemas\CohortForm;
use App\Filament\Resources\Cohorts\Tables\CohortsTable;
use App\Models\Cohort;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class CohortResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'academy';

    protected static array $ownColumns = ['coordinator_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Academy';

    protected static ?int $navigationSort = 2;

    protected static ?string $model = Cohort::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-users';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return CohortForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return CohortsTable::configure($table);
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
            'index' => ListCohorts::route('/'),
            'create' => CreateCohort::route('/create'),
            'edit' => EditCohort::route('/{record}/edit'),
        ];
    }
}
