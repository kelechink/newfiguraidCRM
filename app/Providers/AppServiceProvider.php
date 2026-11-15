<?php

namespace App\Providers;

use App\Authz\Access;
use App\Models\AuditLog;
use App\Models\KnownDevice;
use App\Models\LoginEvent;
use App\Models\User;
use App\Notifications\Alert;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    public const MAX_FAILED = 5;

    public function register(): void {}

    public function boot(): void
    {
        Model::preventLazyLoading(! app()->isProduction());
        if (app()->isProduction()) {
            URL::forceScheme('https');
        }
        Password::defaults(fn () => Password::min(10)->letters()->numbers()->when(app()->isProduction(), fn ($p) => $p->uncompromised()));
        Access::registerGates();

        RateLimiter::for('public-forms', fn (Request $r) => [Limit::perMinute(5)->by($r->ip()), Limit::perDay(50)->by($r->ip())]);
        RateLimiter::for('chat', fn (Request $r) => [Limit::perMinute(12)->by($r->ip()), Limit::perDay(200)->by($r->ip())]);
        RateLimiter::for('webhooks', fn (Request $r) => Limit::perMinute(120)->by($r->ip()));
        RateLimiter::for('clock', fn (Request $r) => Limit::perMinute(6)->by($r->user()?->id ?: $r->ip()));

        Event::listen(Failed::class, function (Failed $e) {
            $u = $e->user instanceof User ? $e->user : User::where('email', $e->credentials['email'] ?? '')->first();
            LoginEvent::create(['user_id' => $u?->id, 'email' => mb_substr($e->credentials['email'] ?? '', 0, 190), 'event' => 'failed', 'ip' => request()->ip(), 'user_agent' => mb_substr((string) request()->userAgent(), 0, 300)]);
            if ($u) {
                $u->increment('failed_logins');
                if ($u->failed_logins >= self::MAX_FAILED) {
                    $u->forceFill(['locked_until' => now()->addMinutes(15), 'failed_logins' => 0])->saveQuietly();
                    AuditLog::record('account_locked', $u);
                    $u->notify(new Alert('Account locked', 'Too many failed sign-in attempts. Your account is locked for 15 minutes.', null, true));
                }
            }
        });
        Event::listen(Login::class, function (Login $e) {
            $u = $e->user;
            if (! $u instanceof User) {
                return;
            }
            $fp = hash('sha256', request()->userAgent().'|'.$u->id);
            $known = KnownDevice::where('user_id', $u->id)->where('fingerprint', $fp)->exists();
            KnownDevice::where('user_id', $u->id)->where('fingerprint', $fp)->update(['last_seen_at' => now()]);
            if (! $known) {
                KnownDevice::create(['user_id' => $u->id, 'fingerprint' => $fp]);
                if (KnownDevice::where('user_id', $u->id)->count() > 1) {
                    $u->notify(new Alert('New sign-in device', 'Your account was signed in from a new device ('.request()->ip().'). If this was not you, change your password and sign out all devices.', '/app/profile', true));
                }
            }
            LoginEvent::create(['user_id' => $u->id, 'email' => $u->email, 'event' => 'success', 'ip' => request()->ip(), 'user_agent' => mb_substr((string) request()->userAgent(), 0, 300)]);
            $u->forceFill(['failed_logins' => 0, 'last_login_at' => now(), 'last_login_ip' => request()->ip()])->saveQuietly();
            AuditLog::record('login', $u);
        });
        Event::listen(Logout::class, fn (Logout $e) => $e->user instanceof User ? AuditLog::record('logout', $e->user) : null);
    }
}
