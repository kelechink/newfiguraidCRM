<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class RateDeck extends Model
{
    use HasUlids, Audited, \App\Models\Concerns\ProtectsWorkflow;

    protected $guarded = ['id', 'status', 'approved_by_id', 'approved_at', 'validation'];

    protected function casts(): array
    {
        return [
            'effective_from' => 'date',
            'validation' => 'array',
            'approved_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_id');
    }

    public function carrier(): BelongsTo
    {
        return $this->belongsTo(Carrier::class, 'carrier_id');
    }

    public function file(): BelongsTo
    {
        return $this->belongsTo(StoredFile::class, 'file_id');
    }

    public function rates(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(Rate::class);
    }
}
