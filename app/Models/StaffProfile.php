<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class StaffProfile extends Model
{
    use HasUlids, Audited;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'start_date' => 'date',
            'probation_ends' => 'date',
            'next_of_kin' => 'array',
            'salary' => 'encrypted',
            'allowances' => 'encrypted:array',
            'bank_name' => 'encrypted',
            'bank_account' => 'encrypted',
            'account_name' => 'encrypted',
            'id_number' => 'encrypted',
            'working_days' => 'array',
            'remote_allowed' => 'boolean',
            'onboarded_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function office(): BelongsTo
    {
        return $this->belongsTo(Office::class, 'office_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
