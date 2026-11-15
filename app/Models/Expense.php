<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use App\Models\Concerns\Audited;

class Expense extends Model
{
    use HasUlids, Audited, \App\Models\Concerns\ProtectsWorkflow;

    protected $guarded = ['id', 'status', 'approved_by_id', 'approved_at', 'paid_at', 'requested_by_id', 'amount_ngn', 'fx_rate'];

    /** Filled from the signed-in user when a record is created. */
    public array $creatorColumns = ['requested_by_id'];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'fx_rate' => 'decimal:4',
            'amount_ngn' => 'decimal:2',
            'vat' => 'decimal:2',
            'wht' => 'decimal:2',
            'date' => 'date',
            'due_date' => 'date',
            'approved_at' => 'datetime',
            'paid_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(ExpenseCategory::class, 'category_id');
    }

    public function receiptFile(): BelongsTo
    {
        return $this->belongsTo(StoredFile::class, 'receipt_file_id');
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_id');
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(BusinessUnit::class, 'unit_id');
    }

    public function vendor(): BelongsTo
    {
        return $this->belongsTo(Vendor::class, 'vendor_id');
    }

    protected static function booted(): void
    {
        static::saving(function (Expense $e) {
            if ($e->isDirty(['amount', 'currency', 'date']) || $e->amount_ngn === null) {
                $rate = $e->currency === 'NGN' ? 1.0 : (\App\Services\FxService::rate($e->currency, $e->date?->toDateString()) ?? 0);
                $e->fx_rate = $rate;
                $e->amount_ngn = round((float) $e->amount * $rate, 2);
            }
        });
    }
}
