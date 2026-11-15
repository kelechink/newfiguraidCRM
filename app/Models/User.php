<?php

namespace App\Models;

use App\Authz\Access;
use App\Models\Concerns\Audited;
use Filament\Auth\MultiFactor\App\Contracts\HasAppAuthentication;
use Filament\Auth\MultiFactor\App\Contracts\HasAppAuthenticationRecovery;
use Filament\Models\Contracts\FilamentUser;
use Filament\Models\Contracts\HasAvatar;
use Filament\Panel;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable implements FilamentUser, HasAppAuthentication, HasAppAuthenticationRecovery, HasAvatar
{
    use Audited, HasUlids, Notifiable;

    protected $fillable = ['name', 'email', 'phone', 'password', 'status', 'role_id', 'primary_unit_id', 'birthday', 'quiet_hours', 'ip_allowlist', 'access_expires_at', 'avatar_path'];

    protected $hidden = ['password', 'remember_token', 'app_authentication_secret', 'app_authentication_recovery_codes'];

    /** Never write these to the audit trail. */
    public array $auditExclude = ['password', 'remember_token', 'app_authentication_secret', 'app_authentication_recovery_codes', 'failed_logins', 'last_login_at', 'last_login_ip'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'app_authentication_secret' => 'encrypted',
            'app_authentication_recovery_codes' => 'encrypted:array',
            'ip_allowlist' => 'array',
            'quiet_hours' => 'array',
            'birthday' => 'date',
            'locked_until' => 'datetime',
            'last_login_at' => 'datetime',
            'password_changed_at' => 'datetime',
            'access_expires_at' => 'datetime',
            'contract_signed_at' => 'datetime',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function primaryUnit(): BelongsTo
    {
        return $this->belongsTo(BusinessUnit::class, 'primary_unit_id');
    }

    public function units(): BelongsToMany
    {
        return $this->belongsToMany(BusinessUnit::class);
    }

    public function grants(): HasMany
    {
        return $this->hasMany(UserGrant::class);
    }

    public function staffProfile(): HasOne
    {
        return $this->hasOne(StaffProfile::class);
    }

    public function attendanceDays(): HasMany
    {
        return $this->hasMany(AttendanceDay::class);
    }

    /** IDs of business units this user belongs to (primary + memberships). */
    public function unitIds(): array
    {
        return once(fn () => array_values(array_unique(array_filter([$this->primary_unit_id, ...$this->units()->pluck('business_units.id')->all()]))));
    }

    public function canDo(string $module, string $action = 'view'): bool
    {
        return Access::can($this, $module, $action);
    }

    public function isRole(string ...$keys): bool
    {
        return in_array($this->role?->key, $keys, true);
    }

    public function canAccessPanel(Panel $panel): bool
    {
        if (! in_array($this->status, ['active', 'onboarding'], true)) {
            return false;
        }
        if ($this->locked_until?->isFuture()) {
            return false;
        }

        return ! ($this->isRole('auditor') && $this->access_expires_at?->isPast());
    }

    public function requiresTwoFactor(): bool
    {
        return (bool) $this->role?->requires_2fa;
    }

    /** Local initials avatar (no third-party avatar service sees staff names). */
    public function getFilamentAvatarUrl(): ?string
    {
        $initials = collect(preg_split('/\s+/', trim($this->name)))->filter()->take(2)->map(fn ($w) => mb_strtoupper(mb_substr($w, 0, 1)))->implode('');
        $hue = hexdec(substr(md5($this->id ?? $this->email), 0, 2)) * 360 / 255;
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl('.round($hue).',55%,38%)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="26" fill="#fff">'.e($initials).'</text></svg>';

        return 'data:image/svg+xml;base64,'.base64_encode($svg);
    }

    public function getAppAuthenticationSecret(): ?string
    {
        return $this->app_authentication_secret;
    }

    public function saveAppAuthenticationSecret(?string $secret): void
    {
        $this->app_authentication_secret = $secret;
        $this->save();
    }

    public function getAppAuthenticationHolderName(): string
    {
        return $this->email;
    }

    public function getAppAuthenticationRecoveryCodes(): ?array
    {
        return $this->app_authentication_recovery_codes;
    }

    public function saveAppAuthenticationRecoveryCodes(?array $codes): void
    {
        $this->app_authentication_recovery_codes = $codes;
        $this->save();
    }
}
