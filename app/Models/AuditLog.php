<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * Append-only, hash-chained audit trail. Each row's hash covers the previous hash, so any edit or
 * deletion breaks the chain and `php artisan audit:verify` reports it. Updates/deletes are refused.
 */
class AuditLog extends Model
{
    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['before' => 'array', 'after' => 'array', 'at' => 'datetime'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Audit log is append-only.'));
        static::deleting(fn () => throw new LogicException('Audit log is append-only.'));
    }

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_id');
    }

    public static function record(string $action, ?Model $entity = null, ?array $before = null, ?array $after = null, ?string $actorType = null): void
    {
        $user = auth()->user();
        $row = [
            'at' => now()->format('Y-m-d H:i:s.u'),
            'actor_id' => $user instanceof User ? $user->id : null,
            'actor_type' => $actorType ?? ($user ? 'user' : (app()->runningInConsole() ? 'system' : 'public')),
            'action' => $action,
            'entity_type' => $entity ? class_basename($entity) : null,
            'entity_id' => $entity ? (string) $entity->getKey() : null,
            'unit_id' => $entity?->getAttribute('unit_id'),
            'before' => $before ? json_encode($before) : null,
            'after' => $after ? json_encode($after) : null,
            'ip' => app()->runningInConsole() ? null : request()->ip(),
        ];
        DB::transaction(function () use ($row) {
            $head = DB::table('audit_head')->where('id', 1)->lockForUpdate()->first();
            $prev = $head->hash ?? str_repeat('0', 64);
            $row['prev_hash'] = $prev;
            $row['hash'] = self::hashOf($row);
            DB::table('audit_logs')->insert($row);
            DB::table('audit_head')->updateOrInsert(['id' => 1], ['hash' => $row['hash']]);
        });
    }

    public static function hashOf(array $r): string
    {
        $parts = [$r['prev_hash'], $r['at'], $r['actor_id'], $r['actor_type'], $r['action'], $r['entity_type'], $r['entity_id'], $r['before'], $r['after'], $r['ip']];

        return hash('sha256', implode('|', array_map(fn ($p) => (string) $p, $parts)));
    }
}
