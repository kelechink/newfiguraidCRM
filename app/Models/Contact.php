<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\Concerns\Audited;

class Contact extends Model
{
    use HasUlids, SoftDeletes, Audited;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'birthday' => 'date',
            'budget' => 'decimal:2',
            'tags' => 'array',
            'destinations' => 'array',
            'last_activity_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
            'deleted_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class, 'company_id');
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function primaryUnit(): BelongsTo
    {
        return $this->belongsTo(BusinessUnit::class, 'primary_unit_id');
    }

    public function units(): BelongsToMany
    {
        return $this->belongsToMany(BusinessUnit::class);
    }

    public function deals(): HasMany
    {
        return $this->hasMany(Deal::class);
    }

    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class);
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class);
    }

    public function subscriptions(): HasMany
    {
        return $this->hasMany(Subscription::class);
    }

    /** Health 0–100: recent activity, paid invoices, open complaints, overdue balance. */
    public function computeHealth(): int
    {
        $score = 50;
        $days = $this->last_activity_at ? $this->last_activity_at->diffInDays(now()) : 999;
        $score += $days < 14 ? 20 : ($days < 60 ? 5 : -15);
        $score += min(20, $this->invoices()->where('status', 'paid')->count() * 4);
        $score -= $this->invoices()->where('status', 'overdue')->count() * 10;
        $score -= $this->conversations()->where('category', 'complaint')->where('status', 'open')->count() * 10;

        return max(0, min(100, $score));
    }

    protected static function booted(): void
    {
        static::saving(function (Contact $c) {
            $c->email_normalized = $c->email ? strtolower(trim($c->email)) : null;
            $digits = preg_replace('/\D/', '', (string) $c->phone);
            $c->phone_e164 = $digits ? (str_starts_with($digits, '0') && strlen($digits) === 11 ? '234'.substr($digits, 1) : $digits) : null;
            if (! $c->display_name) {
                $c->display_name = trim("$c->first_name $c->last_name") ?: ($c->email ?? 'Unknown');
            }
        });
    }
}
