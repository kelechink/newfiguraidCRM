<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class LeaveRequest extends Model
{
    use HasUlids, Audited, \App\Models\Concerns\ProtectsWorkflow;

    protected $guarded = ['id', 'status', 'approver_id', 'decided_at'];

    /** Filled from the signed-in user when a record is created. */
    public array $creatorColumns = ['user_id'];

    protected static function booted(): void
    {
        static::creating(function ($m) {
            $u = auth()->user();
            if ($u && $m->user_id !== $u->id && ! $u->canDo('leave', 'approve')) {
                $m->user_id = $u->id; // staff can only file for themselves
            }
        });
    }

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'end_date' => 'date',
            'days' => 'decimal:1',
            'decided_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
