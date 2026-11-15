<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class SocialPost extends Model
{
    use HasUlids, Audited, \App\Models\Concerns\ProtectsWorkflow;

    protected $guarded = ['id', 'status', 'approved_by_id', 'external_id', 'published_at', 'error', 'created_by_id'];

    /** Filled from the signed-in user when a record is created. */
    public array $creatorColumns = ['created_by_id'];

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
            'published_at' => 'datetime',
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

    public function imageFile(): BelongsTo
    {
        return $this->belongsTo(StoredFile::class, 'image_file_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(BusinessUnit::class, 'unit_id');
    }
}
