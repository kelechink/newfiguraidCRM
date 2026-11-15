<?php

namespace App\Authz;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Gate;

/**
 * Server-side permission checks. Deny by default: no grant row → no access.
 * Scope: own (records the user owns/is assigned), unit (records in the user's units), all.
 */
final class Access
{
    private static array $memo = [];

    public static function flush(): void
    {
        self::$memo = [];
    }

    /** Effective scope for module/action, or null when denied. */
    public static function scope(?User $user, string $module, string $action = 'view'): ?string
    {
        if (! $user || $user->status !== 'active' && ! ($user->status === 'onboarding' && in_array($module, Catalog::ONBOARDING_MODULES))) {
            return null;
        }
        if ($user->role?->key === 'auditor' && $user->access_expires_at && $user->access_expires_at->isPast()) {
            return null;
        }
        $map = self::$memo[$user->id] ??= self::load($user);

        return $map["$module:$action"] ?? null;
    }

    public static function can(?User $user, string $module, string $action = 'view'): bool
    {
        return self::scope($user, $module, $action) !== null;
    }

    public static function authorize(?User $user, string $module, string $action = 'view'): string
    {
        $s = self::scope($user, $module, $action);
        abort_if($s === null, 403);

        return $s;
    }

    private static function load(User $user): array
    {
        $order = array_flip(Catalog::SCOPES);
        $map = [];
        $rows = $user->role ? $user->role->permissions()->get(['module', 'action', 'scope']) : collect();
        $grants = $user->grants()->whereNull('revoked_at')->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))->get(['module', 'action', 'scope']);
        foreach ($rows->concat($grants) as $r) {
            $k = "$r->module:$r->action";
            if (! isset($map[$k]) || $order[$r->scope] > $order[$map[$k]]) {
                $map[$k] = $r->scope;
            }
        }

        return $map;
    }

    /**
     * Restrict a query to what the user may see. $ownCols are user-id columns meaning "mine";
     * $unitCol is the business-unit column. Unknown scope → empty result.
     */
    public static function scopeQuery(Builder $q, ?User $user, string $module, array $ownCols = ['owner_id'], ?string $unitCol = 'unit_id', string $action = 'view'): Builder
    {
        $s = self::scope($user, $module, $action);

        return match ($s) {
            'all' => $q,
            'unit' => $unitCol ? $q->whereIn($q->qualifyColumn($unitCol), $user->unitIds()) : self::own($q, $user, $ownCols),
            'own' => self::own($q, $user, $ownCols),
            default => $q->whereRaw('1 = 0'),
        };
    }

    private static function own(Builder $q, User $user, array $cols): Builder
    {
        return $q->where(function ($w) use ($q, $user, $cols) {
            foreach ($cols as $c) {
                $w->orWhere($q->qualifyColumn($c), $user->id);
            }
        });
    }

    /** Whether one record is inside the user's scope. */
    public static function allows(?User $user, string $module, string $action, $record, array $ownCols = ['owner_id'], ?string $unitCol = 'unit_id'): bool
    {
        $s = self::scope($user, $module, $action);
        if ($s === 'all') {
            return true;
        }
        if ($s === 'unit' && $unitCol && $record->{$unitCol}) {
            return in_array($record->{$unitCol}, $user->unitIds());
        }
        if ($s === 'own' || $s === 'unit') {
            foreach ($ownCols as $c) {
                if ($record->{$c} === $user->id) {
                    return true;
                }
            }
        }

        return false;
    }

    public static function registerGates(): void
    {
        Gate::define('module', fn (User $u, string $module, string $action = 'view') => self::can($u, $module, $action));
    }
}
