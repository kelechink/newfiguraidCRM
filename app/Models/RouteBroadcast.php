<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class RouteBroadcast extends Model
{
    use HasUlids, Audited, \App\Models\Concerns\ProtectsWorkflow;

    protected $guarded = ['id', 'status', 'approved_by_id', 'sent_at', 'send_log', 'created_by_id'];

    /** Filled from the signed-in user when a record is created. */
    public array $creatorColumns = ['created_by_id'];

    protected function casts(): array
    {
        return [
            'recipient_carrier_ids' => 'array',
            'send_log' => 'array',
            'sent_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function rateDeck(): BelongsTo
    {
        return $this->belongsTo(RateDeck::class, 'rate_deck_id');
    }
}
