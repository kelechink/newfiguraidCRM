<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StaffPoint extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['breakdown' => 'array'];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
