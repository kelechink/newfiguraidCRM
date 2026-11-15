<?php

namespace App\Filament\Resources\StaffProfiles;

use App\Filament\Resources\StaffProfiles\Pages\CreateStaffProfile;
use App\Filament\Resources\StaffProfiles\Pages\EditStaffProfile;
use App\Filament\Resources\StaffProfiles\Pages\ListStaffProfiles;
use App\Filament\Resources\StaffProfiles\Schemas\StaffProfileForm;
use App\Filament\Resources\StaffProfiles\Tables\StaffProfilesTable;
use App\Models\StaffProfile;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class StaffProfileResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'hr.staff';

    protected static array $ownColumns = ['user_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 6;

    protected static ?string $navigationLabel = 'Staff records';

    protected static ?string $model = StaffProfile::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-identification';

    protected static ?string $recordTitleAttribute = 'job_title';

    public static function form(Schema $schema): Schema
    {
        return StaffProfileForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return StaffProfilesTable::configure($table);
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
            'index' => ListStaffProfiles::route('/'),
            'create' => CreateStaffProfile::route('/create'),
            'edit' => EditStaffProfile::route('/{record}/edit'),
        ];
    }
}
