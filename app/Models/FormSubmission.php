<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class FormSubmission extends Model
{
    use HasUlids, Audited;

    const UPDATED_AT = null;

    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'data' => 'array',
            'accepted' => 'array',
            'utm' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class, 'contact_id');
    }

    public function leadForm(): BelongsTo
    {
        return $this->belongsTo(LeadForm::class, 'lead_form_id');
    }
}
