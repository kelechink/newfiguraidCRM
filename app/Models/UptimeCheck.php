<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\Concerns\Audited;

class UptimeCheck extends Model
{
    use Audited;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'is_up' => 'boolean',
            'last_checked_at' => 'datetime',
            'down_since' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }
}
