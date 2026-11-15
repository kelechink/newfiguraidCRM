<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class Carrier extends Model
{
    use HasUlids, SoftDeletes, Audited;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'credit_limit' => 'decimal:2',
            'prepaid_balance' => 'decimal:2',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
            'deleted_at' => 'datetime',
        ];
    }

    public function accountManager(): BelongsTo
    {
        return $this->belongsTo(User::class, 'account_manager_id');
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class, 'contact_id');
    }

    public function contacts(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(CarrierContact::class);
    }

    public function documents(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(CarrierDocument::class);
    }

    public function rates(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Rate::class);
    }
}
