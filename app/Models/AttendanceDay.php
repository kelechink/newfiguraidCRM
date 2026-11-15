<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\Concerns\Audited;

class AttendanceDay extends Model
{
    use HasUlids, Audited;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'first_in_at' => 'datetime',
            'last_out_at' => 'datetime',
            'missing_clock_out' => 'boolean',
            'is_flagged' => 'boolean',
            'payroll_locked_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function punches(): HasMany
    {
        return $this->hasMany(AttendancePunch::class);
    }

    public function excuses(): HasMany
    {
        return $this->hasMany(AttendanceExcuse::class);
    }
}
