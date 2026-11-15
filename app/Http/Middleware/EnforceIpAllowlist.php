<?php

namespace App\Http\Middleware;

use App\Models\Setting;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\IpUtils;

/** Admin & finance roles may be limited to office/approved IPs (Settings → security.admin_ip_allowlist, or per user). */
class EnforceIpAllowlist
{
    public const ROLES = ['super_admin', 'admin', 'finance'];

    public function handle(Request $request, Closure $next)
    {
        $u = $request->user();
        if ($u && in_array($u->role?->key, self::ROLES, true)) {
            $list = array_filter(array_merge((array) Setting::get('security.admin_ip_allowlist', []), (array) ($u->ip_allowlist ?? [])));
            if ($list && ! IpUtils::checkIp($request->ip(), $list)) {
                abort(403, 'This account can only sign in from an approved network.');
            }
        }

        return $next($request);
    }
}
