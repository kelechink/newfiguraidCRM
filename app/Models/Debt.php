<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use App\Models\Concerns\Audited;

class Debt extends Model
{
    use HasUlids, Audited;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'principal' => 'decimal:2',
            'outstanding' => 'decimal:2',
            'interest_rate_pct' => 'decimal:2',
            'start_date' => 'date',
            'end_date' => 'date',
            'instalment' => 'decimal:2',
            'next_payment_on' => 'date',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function payments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(DebtPayment::class);
    }
}
