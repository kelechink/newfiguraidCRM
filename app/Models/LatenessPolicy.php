<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class LatenessPolicy extends Model
{
    use HasUlids, Audited;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'fixed_amount' => 'decimal:2',
            'tiers' => 'array',
            'early_leave_amount' => 'decimal:2',
            'absence_amount' => 'decimal:2',
            'monthly_cap_amount' => 'decimal:2',
            'monthly_cap_pct' => 'decimal:2',
            'effective_from' => 'date',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(BusinessUnit::class, 'unit_id');
    }
}
