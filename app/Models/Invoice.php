<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\Concerns\Audited;

class Invoice extends Model
{
    use HasUlids, SoftDeletes, Audited, \App\Models\Concerns\ProtectsWorkflow;

    protected $guarded = ['id', 'amount_paid', 'signature_name', 'signed_at', 'signed_ip', 'public_token', 'number', 'created_by_id'];

    /** Filled from the signed-in user when a record is created. */
    public array $creatorColumns = ['created_by_id'];

    protected function casts(): array
    {
        return [
            'fx_rate' => 'decimal:4',
            'issue_date' => 'date',
            'due_date' => 'date',
            'subtotal' => 'decimal:2',
            'vat' => 'decimal:2',
            'wht' => 'decimal:2',
            'total' => 'decimal:2',
            'amount_paid' => 'decimal:2',
            'signed_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
            'deleted_at' => 'datetime',
        ];
    }

    public function carrier(): BelongsTo
    {
        return $this->belongsTo(Carrier::class, 'carrier_id');
    }

    public function contact(): BelongsTo
    {
        return $this->belongsTo(Contact::class, 'contact_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_id');
    }

    public function deal(): BelongsTo
    {
        return $this->belongsTo(Deal::class, 'deal_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(BusinessUnit::class, 'unit_id');
    }

    public function lines(): HasMany
    {
        return $this->hasMany(InvoiceLine::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function outstanding(): float
    {
        return round((float) $this->total - (float) $this->amount_paid, 2);
    }

    protected static function booted(): void
    {
        static::creating(function (Invoice $i) {
            $i->number ??= \App\Services\InvoiceService::nextNumber(BusinessUnit::find($i->unit_id)?->code ?? 'GEN', $i->kind ?? 'invoice');
            $i->public_token ??= \Illuminate\Support\Str::random(40);
        });
    }
}
