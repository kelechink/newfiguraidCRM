<?php

namespace App\Services;

use App\Authz\Access;
use App\Domain\Telecom;
use App\Models\AuditLog;
use App\Models\Setting;
use Filament\Actions\Action;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Controlled CSV exports: only people with the "exports" permission (plus view rights on the data), only rows
 * inside their scope, every export logged, and admins alerted on unusual volume. Cells are protected against
 * spreadsheet formula injection.
 */
class Exports
{
    /** @param array<string, callable|string> $columns header => attribute or fn($record) */
    public static function action(string $what, string $module, \Closure $query, array $columns): Action
    {
        return Action::make('export')->label('Export CSV')->icon('heroicon-o-arrow-down-tray')->color('gray')
            ->visible(fn () => Access::can(auth()->user(), 'exports', 'create') && Access::can(auth()->user(), $module, 'view'))
            ->requiresConfirmation()->modalDescription('Exports are logged and visible to administrators. Only data you are allowed to see is included.')
            ->action(fn () => self::download($what, $query(), $columns));
    }

    public static function download(string $what, Builder $q, array $columns)
    {
        $u = auth()->user();
        abort_unless(Access::can($u, 'exports', 'create'), 403);
        $rows = $q->limit(20000)->get();
        $csv = implode(',', array_map(fn ($h) => '"'.$h.'"', array_keys($columns)))."\r\n";
        foreach ($rows as $r) {
            $csv .= implode(',', array_map(function ($c) use ($r) {
                $v = is_callable($c) ? $c($r) : data_get($r, $c);
                if ($v instanceof \DateTimeInterface) {
                    $v = $v->format('Y-m-d H:i');
                }

                return '"'.str_replace('"', '""', Telecom::csvCell(is_array($v) ? implode('; ', $v) : (string) $v)).'"';
            }, $columns))."\r\n";
        }
        DB::table('export_logs')->insert(['user_id' => $u->id, 'what' => $what, 'rows' => $rows->count(), 'ip' => request()->ip(), 'created_at' => now()]);
        AuditLog::record('export', null, null, ['what' => $what, 'rows' => $rows->count()]);
        $today = DB::table('export_logs')->where('user_id', $u->id)->where('created_at', '>=', today())->count();
        if ($today > (int) Setting::get('security.max_exports_per_day', 3) || $rows->count() > 5000) {
            if (Cache::add("export-alert:$u->id:".today()->toDateString(), 1, 86400)) {
                Ops::notifyRoles(['super_admin'], 'Unusual data export', "{$u->name} has exported $today time(s) today (latest: $what, {$rows->count()} rows).", '/app/audit-logs', true);
            }
        }

        return response()->streamDownload(fn () => print("\xEF\xBB\xBF".$csv), str($what)->slug().'-'.now()->format('Ymd-His').'.csv', ['Content-Type' => 'text/csv']);
    }
}
