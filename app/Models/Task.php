<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class Task extends Model
{
    use HasUlids, Audited, \App\Models\Concerns\ProtectsWorkflow;

    protected $guarded = ['id', 'escalated_at', 'reminder_count', 'last_reminded_at'];

    /** Filled from the signed-in user when a record is created. */
    public array $creatorColumns = ['creator_id'];

    protected function casts(): array
    {
        return [
            'due_at' => 'datetime',
            'completed_at' => 'datetime',
            'checklist' => 'array',
            'last_reminded_at' => 'datetime',
            'escalated_at' => 'datetime',
            'tags' => 'array',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assignee_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'creator_id');
    }

    public function playbook(): BelongsTo
    {
        return $this->belongsTo(Playbook::class, 'playbook_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(BusinessUnit::class, 'unit_id');
    }

    public function comments(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(TaskComment::class);
    }

    protected static function booted(): void
    {
        static::saving(function (Task $t) {
            if ($t->isDirty('status')) {
                $t->completed_at = $t->status === 'done' ? ($t->completed_at ?? now()) : null;
            }
        });
    }
}
