<?php

namespace App\Models;

use App\Models\Concerns\Audited;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WhiteboardPost extends Model
{
    use Audited, HasUlids;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['hashtags' => 'array', 'retracted_at' => 'datetime', 'expires_at' => 'datetime'];
    }

    public function subject(): BelongsTo
    {
        return $this->belongsTo(User::class, 'subject_user_id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    /** Visible on the board: not retracted, not expired. */
    public function scopeLive(Builder $q): Builder
    {
        return $q->whereNull('retracted_at')->where(fn ($w) => $w->whereNull('expires_at')->orWhere('expires_at', '>', now()));
    }
}
