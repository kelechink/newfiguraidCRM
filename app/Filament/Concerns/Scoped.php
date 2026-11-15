<?php

namespace App\Filament\Concerns;

use App\Authz\Access;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Server-side permission + scope checks for every Filament resource (deny by default).
 * Each resource declares: $module, $ownColumns (user-id columns meaning "mine"), $unitColumn.
 */
trait Scoped
{
    public static function getEloquentQuery(): Builder
    {
        return Access::scopeQuery(parent::getEloquentQuery(), auth()->user(), static::$module, static::$ownColumns, static::$unitColumn);
    }

    public static function canViewAny(): bool
    {
        return Access::can(auth()->user(), static::$module, 'view');
    }

    public static function canView(Model $record): bool
    {
        return Access::allows(auth()->user(), static::$module, 'view', $record, static::$ownColumns, static::$unitColumn);
    }

    public static function canCreate(): bool
    {
        return Access::can(auth()->user(), static::$module, 'create');
    }

    public static function canEdit(Model $record): bool
    {
        return Access::allows(auth()->user(), static::$module, 'edit', $record, static::$ownColumns, static::$unitColumn);
    }

    public static function canDelete(Model $record): bool
    {
        return Access::allows(auth()->user(), static::$module, 'delete', $record, static::$ownColumns, static::$unitColumn);
    }

    public static function canDeleteAny(): bool
    {
        return Access::can(auth()->user(), static::$module, 'delete');
    }

    public static function canForceDelete(Model $record): bool
    {
        return static::canDelete($record);
    }

    public static function canForceDeleteAny(): bool
    {
        return static::canDeleteAny();
    }

    public static function canRestore(Model $record): bool
    {
        return static::canEdit($record);
    }

    public static function canRestoreAny(): bool
    {
        return Access::can(auth()->user(), static::$module, 'edit');
    }
}
