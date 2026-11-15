<?php

namespace App\Filament\Resources\Goals;

use App\Filament\Resources\Goals\Pages\CreateGoal;
use App\Filament\Resources\Goals\Pages\EditGoal;
use App\Filament\Resources\Goals\Pages\ListGoals;
use App\Filament\Resources\Goals\Schemas\GoalForm;
use App\Filament\Resources\Goals\Tables\GoalsTable;
use App\Models\Goal;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class GoalResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'targets';

    protected static array $ownColumns = ['owner_id'];

    protected static ?string $unitColumn = 'unit_id';

    protected static string|\UnitEnum|null $navigationGroup = 'Today';

    protected static ?int $navigationSort = 4;

    protected static ?string $model = Goal::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-flag';

    protected static ?string $recordTitleAttribute = 'objective';

    public static function form(Schema $schema): Schema
    {
        return GoalForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return GoalsTable::configure($table);
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
            'index' => ListGoals::route('/'),
            'create' => CreateGoal::route('/create'),
            'edit' => EditGoal::route('/{record}/edit'),
        ];
    }
}
