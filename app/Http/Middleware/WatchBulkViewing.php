<?php

namespace App\Http\Middleware;

use App\Models\AuditLog;
use App\Models\Setting;
use App\Services\Ops;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/** Counts records opened per person per hour; alerts the Super Admin once when it looks like scraping. */
class WatchBulkViewing
{
    public function handle(Request $request, Closure $next)
    {
        $u = $request->user();
        if ($u && $request->isMethod('GET') && preg_match('#^app/[a-z-]+/[0-9a-z]{26}(/edit)?$#', $request->path())) {
            $key = 'views:'.$u->id.':'.now()->format('YmdH');
            Cache::add($key, 0, 3700);
            $n = Cache::increment($key);
            $limit = (int) Setting::get('security.max_record_views_per_hour', 150);
            if ($n > $limit && Cache::add("views-alert:$u->id:".now()->format('YmdH'), 1, 3700)) {
                AuditLog::record('bulk_viewing', $u, null, ['records_this_hour' => $n]);
                Ops::notifyRoles(['super_admin'], 'Unusual record viewing', "{$u->name} opened $n records in the last hour.", '/app/login-events', true);
            }
        }

        return $next($request);
    }
}
