<?php

namespace App\Filament\Resources\Users;

use App\Filament\Resources\Users\Pages\CreateUser;
use App\Filament\Resources\Users\Pages\EditUser;
use App\Filament\Resources\Users\Pages\ListUsers;
use App\Filament\Resources\Users\Schemas\UserForm;
use App\Filament\Resources\Users\Tables\UsersTable;
use App\Models\User;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class UserResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'settings';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = 'primary_unit_id';

    protected static string|\UnitEnum|null $navigationGroup = 'Admin';

    protected static ?int $navigationSort = 1;

    protected static ?string $navigationLabel = 'Users';

    protected static ?string $model = User::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-user-circle';

    protected static ?string $recordTitleAttribute = 'name';

    /** Only a Super Admin can edit or deactivate a Super Admin account (stops an Admin taking over the top account). */
    public static function canEdit(\Illuminate\Database\Eloquent\Model $record): bool
    {
        return \App\Authz\Access::allows(auth()->user(), static::$module, 'edit', $record, static::$ownColumns, static::$unitColumn)
            && (! $record->isRole('super_admin') || auth()->user()->isRole('super_admin'));
    }

    public static function canDelete(\Illuminate\Database\Eloquent\Model $record): bool
    {
        return false; // people are offboarded (Revoke access), never deleted — keeps the audit trail intact
    }

    public static function form(Schema $schema): Schema
    {
        return UserForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return UsersTable::configure($table);
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
            'index' => ListUsers::route('/'),
            'create' => CreateUser::route('/create'),
            'edit' => EditUser::route('/{record}/edit'),
        ];
    }
}
