<?php

namespace App\Models\Concerns;

use App\Models\AuditLog;

/** Writes create/update/delete of the model into the hash-chained audit log. */
trait Audited
{
    public static function bootAudited(): void
    {
        static::created(fn ($m) => AuditLog::record('created', $m, null, $m->auditable($m->getAttributes())));
        static::updated(function ($m) {
            $changes = $m->auditable($m->getChanges());
            unset($changes['updated_at']);
            if ($changes) {
                AuditLog::record('updated', $m, $m->auditable(array_intersect_key($m->getOriginal(), $changes)), $changes);
            }
        });
        static::deleted(fn ($m) => AuditLog::record('deleted', $m, $m->auditable($m->getOriginal()), null));
    }

    /** Strip excluded fields and redact encrypted ones (the trail must never hold salaries or bank details). */
    public function auditable(array $attrs): array
    {
        $exclude = property_exists($this, 'auditExclude') ? $this->auditExclude : [];
        $out = [];
        foreach ($attrs as $k => $v) {
            if (in_array($k, $exclude, true)) {
                continue;
            }
            $cast = $this->getCasts()[$k] ?? '';
            $out[$k] = str_starts_with((string) $cast, 'encrypted') ? '[encrypted]' : (is_scalar($v) || $v === null ? $v : (string) json_encode($v));
        }

        return $out;
    }
}
