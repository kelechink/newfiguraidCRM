<?php

namespace App\Models;

use App\Models\Concerns\Audited;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;

/** Customer portal login (carriers, hosting clients, Academy students). Separate guard from staff. */
class PortalUser extends Authenticatable
{
    use Audited, HasUlids;

    protected $fillable = ['contact_id', 'carrier_id', 'email', 'password'];

    protected $hidden = ['password', 'remember_token'];

    public array $auditExclude = ['password', 'remember_token', 'last_login_at'];

    protected function casts(): array
    {
        return ['password' => 'hashed', 'last_login_at' => 'datetime'];
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function carrier(): BelongsTo
    {
        return $this->belongsTo(Carrier::class);
    }
}
