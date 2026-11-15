<?php

namespace App\Filament\Resources\AttendanceDays;

use App\Filament\Resources\AttendanceDays\Pages\CreateAttendanceDay;
use App\Filament\Resources\AttendanceDays\Pages\EditAttendanceDay;
use App\Filament\Resources\AttendanceDays\Pages\ListAttendanceDays;
use App\Filament\Resources\AttendanceDays\Schemas\AttendanceDayForm;
use App\Filament\Resources\AttendanceDays\Tables\AttendanceDaysTable;
use App\Models\AttendanceDay;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class AttendanceDayResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'attendance';

    protected static array $ownColumns = ['user_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 1;

    protected static ?string $navigationLabel = 'Attendance';

    protected static ?string $model = AttendanceDay::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-clock';

    protected static ?string $recordTitleAttribute = 'date';

    public static function form(Schema $schema): Schema
    {
        return AttendanceDayForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return AttendanceDaysTable::configure($table);
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
            'index' => ListAttendanceDays::route('/'),
            'create' => CreateAttendanceDay::route('/create'),
            'edit' => EditAttendanceDay::route('/{record}/edit'),
        ];
    }
}
