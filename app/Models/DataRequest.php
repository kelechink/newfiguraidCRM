<?php

namespace App\Models;

use App\Models\Concerns\Audited;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DataRequest extends Model
{
    use Audited, HasUlids;

    protected $guarded = ['id', 'status', 'verify_token', 'verified_at', 'handled_by_id'];

    protected $hidden = ['verify_token'];

    protected function casts(): array
    {
        return ['verified_at' => 'datetime', 'due_on' => 'date'];
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class);
    }

    public function handledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'handled_by_id');
    }
}
