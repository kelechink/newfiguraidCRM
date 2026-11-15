<?php

namespace App\Filament\Resources\TrainingCourses;

use App\Filament\Resources\TrainingCourses\Pages\CreateTrainingCourse;
use App\Filament\Resources\TrainingCourses\Pages\EditTrainingCourse;
use App\Filament\Resources\TrainingCourses\Pages\ListTrainingCourses;
use App\Filament\Resources\TrainingCourses\Schemas\TrainingCourseForm;
use App\Filament\Resources\TrainingCourses\Tables\TrainingCoursesTable;
use App\Models\TrainingCourse;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class TrainingCourseResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'training';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 13;

    protected static ?string $model = TrainingCourse::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-light-bulb';

    protected static ?string $recordTitleAttribute = 'title';

    public static function form(Schema $schema): Schema
    {
        return TrainingCourseForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return TrainingCoursesTable::configure($table);
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
            'index' => ListTrainingCourses::route('/'),
            'create' => CreateTrainingCourse::route('/create'),
            'edit' => EditTrainingCourse::route('/{record}/edit'),
        ];
    }
}
