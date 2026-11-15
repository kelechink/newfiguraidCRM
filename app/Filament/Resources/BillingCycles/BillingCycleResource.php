<?php

namespace App\Filament\Resources\BillingCycles;

use App\Filament\Resources\BillingCycles\Pages\ManageBillingCycles;
use App\Models\BillingCycle;
use App\Models\StoredFile;
use App\Services\CarrierBilling;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Support\Facades\Storage;

/** Carrier billing cycles: invoices we raise and vendor statements we check. */
class BillingCycleResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'telecom.billing';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Telecom';

    protected static ?int $navigationSort = 10;

    protected static ?string $navigationLabel = 'Billing cycles';

    protected static ?string $model = BillingCycle::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-arrow-path-rounded-square';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([]);
    }

    public static function table(Table $table): Table
    {
        return $table->defaultSort('period_start', 'desc')->columns([
            TextColumn::make('carrier.name')->searchable(),
            TextColumn::make('side')->badge()->color(fn ($state) => $state === 'customer' ? 'info' : 'warning')->formatStateUsing(fn ($state) => $state === 'customer' ? 'We bill' : 'Vendor bills us'),
            TextColumn::make('period_start')->date('j M')->label('From'),
            TextColumn::make('period_end')->label('To')->formatStateUsing(fn ($state) => $state->subDay()->format('j M Y')),
            TextColumn::make('minutes')->numeric(2),
            TextColumn::make('amount')->label('Our figure')->formatStateUsing(fn ($state, $record) => $record->currency.' '.number_format((float) $state, 2)),
            TextColumn::make('statement_amount')->label('Their figure')->placeholder('—')->formatStateUsing(fn ($state, $record) => $record->currency.' '.number_format((float) $state, 2)),
            TextColumn::make('status')->badge()->color(fn ($state) => match ($state) { 'matched', 'settled' => 'success', 'mismatch', 'disputed' => 'danger', 'invoiced' => 'info', default => 'warning' }),
            TextColumn::make('invoice.number')->label('Invoice')->url(fn ($record) => $record->invoice_id ? "/app/invoices/{$record->invoice_id}/edit" : null),
            TextColumn::make('due_date')->date('j M'),
        ])->filters([
            SelectFilter::make('side')->options(['customer' => 'We bill', 'vendor' => 'Vendor bills us']),
            SelectFilter::make('status')->options(['open' => 'Open', 'invoiced' => 'Invoiced', 'matched' => 'Matched', 'mismatch' => 'Mismatch', 'settled' => 'Settled']),
        ])->recordActions([
            Action::make('statement')->label('Enter vendor statement')->icon('heroicon-o-document-check')
                ->visible(fn ($record) => $record->side === 'vendor' && in_array($record->status, ['open', 'mismatch']) && auth()->user()->canDo('telecom.billing', 'edit'))
                ->schema([
                    TextInput::make('minutes')->label('Minutes on their statement')->numeric()->required(),
                    TextInput::make('amount')->label('Amount on their statement')->numeric()->required(),
                    FileUpload::make('file')->disk('private')->directory('vendor-statements')->maxSize(20480),
                ])
                ->action(function ($record, array $data) {
                    $fileId = null;
                    if (! empty($data['file'])) {
                        $path = Storage::disk('private')->path($data['file']);
                        $fileId = StoredFile::create(['disk' => 'private', 'path' => $data['file'], 'original_name' => basename($data['file']), 'mime' => mime_content_type($path) ?: 'application/octet-stream', 'size' => filesize($path), 'sha256' => hash_file('sha256', $path), 'purpose' => 'vendor_statement', 'uploaded_by_id' => auth()->id()])->id;
                    }
                    $status = app(CarrierBilling::class)->recordStatement($record, (float) $data['minutes'], (float) $data['amount'], $fileId);
                    Notification::make()->title($status === 'matched' ? 'Statement matches our traffic' : 'Mismatch — a dispute was opened')->{$status === 'matched' ? 'success' : 'danger'}()->send();
                }),
        ])->headerActions([
            Action::make('run')->label('Close finished cycles now')->color('gray')->visible(fn () => auth()->user()->canDo('telecom.billing', 'create'))
                ->action(function () {
                    $r = app(CarrierBilling::class)->closeCycles();
                    Notification::make()->title("{$r['invoices']} invoice(s), {$r['vendor_cycles']} vendor cycle(s)")->success()->send();
                }),
        ]);
    }

    public static function getPages(): array
    {
        return ['index' => ManageBillingCycles::route('/')];
    }
}
