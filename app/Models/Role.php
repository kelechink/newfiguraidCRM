<?php

namespace App\Models;

use App\Models\Concerns\Audited;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Role extends Model
{
    use Audited, HasUlids;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return ['requires_2fa' => 'boolean', 'is_system' => 'boolean'];
    }

    public function permissions(): HasMany
    {
        return $this->hasMany(RolePermission::class);
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }
}
