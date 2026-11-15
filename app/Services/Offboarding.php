<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Device;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** Offboarding revokes access instantly: status, sessions, remember token, grants, devices, 2FA. */
class Offboarding
{
    public static function signOutEverywhere(User $u): void
    {
        DB::table('sessions')->where('user_id', $u->id)->delete();
        $u->forceFill(['remember_token' => null])->saveQuietly();
        AuditLog::record('sign_out_all_devices', $u);
    }

    public static function revoke(User $u, string $status = 'exited'): void
    {
        DB::transaction(function () use ($u, $status) {
            $u->forceFill(['status' => $status])->save();
            $u->grants()->whereNull('revoked_at')->update(['revoked_at' => now()]);
            Device::where('user_id', $u->id)->update(['status' => 'blocked']);
            self::signOutEverywhere($u);
            AuditLog::record('access_revoked', $u);
        });
    }
}
