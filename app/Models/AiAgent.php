<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use App\Models\Concerns\Audited;

class AiAgent extends Model
{
    use HasUlids, Audited;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'units' => 'array',
            'approval_required' => 'array',
            'last_active_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }
}
