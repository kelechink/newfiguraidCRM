<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class TrafficEntry extends Model
{
    use HasUlids, Audited;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'minutes' => 'decimal:2',
            'sell_rate' => 'decimal:6',
            'buy_rate' => 'decimal:6',
            'revenue' => 'decimal:4',
            'cost' => 'decimal:4',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function customerCarrier(): BelongsTo
    {
        return $this->belongsTo(Carrier::class, 'customer_carrier_id');
    }

    public function enteredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'entered_by_id');
    }

    public function vendorCarrier(): BelongsTo
    {
        return $this->belongsTo(Carrier::class, 'vendor_carrier_id');
    }
}
