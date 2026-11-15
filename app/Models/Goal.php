<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class Goal extends Model
{
    use HasUlids, Audited;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(BusinessUnit::class, 'unit_id');
    }

    public function keyResults(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(KeyResult::class);
    }
}
