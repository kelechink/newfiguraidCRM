<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class ChatMessage extends Model
{
    use HasUlids, SoftDeletes, Audited;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'attachments' => 'array',
            'mentions' => 'array',
            'tags' => 'array',
            'pinned' => 'boolean',
            'edited_at' => 'datetime',
            'deleted_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function chatChannel(): BelongsTo
    {
        return $this->belongsTo(ChatChannel::class, 'chat_channel_id');
    }
}
