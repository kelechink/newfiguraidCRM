<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class RolePermission extends Model
{
    use Audited;

    public $timestamps = false;

    protected $guarded = ['id'];


    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id');
    }
}
