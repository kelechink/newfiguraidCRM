<?php

namespace App\Filament\Resources\AttendancePunches;

use App\Filament\Resources\AttendancePunches\Pages\CreateAttendancePunch;
use App\Filament\Resources\AttendancePunches\Pages\EditAttendancePunch;
use App\Filament\Resources\AttendancePunches\Pages\ListAttendancePunches;
use App\Filament\Resources\AttendancePunches\Schemas\AttendancePunchForm;
use App\Filament\Resources\AttendancePunches\Tables\AttendancePunchesTable;
use App\Models\AttendancePunch;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class AttendancePunchResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'attendance.review';

    protected static array $ownColumns = ['user_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 2;

    protected static ?string $navigationLabel = 'Clock-ins (review)';

    protected static ?string $model = AttendancePunch::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-map-pin';

    protected static ?string $recordTitleAttribute = 'type';

    public static function form(Schema $schema): Schema
    {
        return AttendancePunchForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return AttendancePunchesTable::configure($table);
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
            'index' => ListAttendancePunches::route('/'),
            'create' => CreateAttendancePunch::route('/create'),
            'edit' => EditAttendancePunch::route('/{record}/edit'),
        ];
    }
}
