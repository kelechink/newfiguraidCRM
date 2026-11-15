<?php

namespace App\Filament\Resources\Invoices\Schemas;

use App\Authz\Access;
use App\Models\BusinessUnit;
use App\Services\FxService;
use App\Services\InvoiceService;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\Repeater;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Illuminate\Support\Str;

class InvoiceForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema->columns(3)->components([
            Section::make()->columns(3)->columnSpanFull()->schema([
                Select::make('kind')->options(['invoice' => 'Invoice', 'quote' => 'Quote / proposal', 'credit' => 'Credit note'])->default('invoice')->required()->disabledOn('edit'),
                Select::make('unit_id')->label('Business unit')->relationship('unit', 'name')->required()->disabledOn('edit')
                    ->default(fn () => auth()->user()->primary_unit_id),
                TextInput::make('number')->disabled()->dehydrated(false)->placeholder('Assigned on save'),
                Select::make('contact_id')->relationship('contact', 'display_name')->searchable()->preload(),
                Select::make('carrier_id')->relationship('carrier', 'name')->searchable()->preload()->helperText('Telecom invoices'),
                Select::make('deal_id')->relationship('deal', 'title')->searchable(),
                Select::make('currency')->options(['NGN' => 'NGN', 'USD' => 'USD', 'EUR' => 'EUR', 'GBP' => 'GBP'])->default('NGN')->required()->live()
                    ->afterStateUpdated(fn ($state, callable $set) => $set('fx_rate', FxService::rate($state) ?? 1)),
                TextInput::make('fx_rate')->label('₦ per unit (stored on the invoice)')->numeric()->default(1)->required(),
                Select::make('status')->options(['draft' => 'Draft', 'sent' => 'Sent', 'part_paid' => 'Part paid', 'paid' => 'Paid', 'overdue' => 'Overdue', 'void' => 'Void', 'accepted' => 'Accepted'])->default('draft')->required(),
                DatePicker::make('issue_date')->default(today())->required(),
                DatePicker::make('due_date')->default(today()->addDays(14))->required(),
            ]),
            Repeater::make('lines')->relationship()->columnSpanFull()->columns(6)->defaultItems(1)->schema([
                TextInput::make('description')->required()->columnSpan(2),
                TextInput::make('quantity')->numeric()->default(1)->required(),
                TextInput::make('unit_price')->numeric()->required(),
                TextInput::make('cost_price')->numeric()->label('Cost (internal)')->visible(fn () => Access::can(auth()->user(), 'procurement', 'view')),
                Toggle::make('vatable')->label('VAT 7.5%')->default(true)->inline(false),
                Hidden::make('amount')->default(0),
            ])->mutateRelationshipDataBeforeSaveUsing(fn (array $d) => $d + ['amount' => round((float) $d['quantity'] * (float) $d['unit_price'], 2)])
              ->mutateRelationshipDataBeforeCreateUsing(fn (array $d) => array_merge($d, ['amount' => round((float) $d['quantity'] * (float) $d['unit_price'], 2)])),
            Textarea::make('notes')->columnSpanFull(),
            Hidden::make('created_by_id')->default(fn () => auth()->id()),
        ]);
    }

    /** Called from Create page before save. */
    public static function prepare(array $data): array
    {
        $unit = BusinessUnit::findOrFail($data['unit_id']);
        $data['number'] = InvoiceService::nextNumber($unit->code, $data['kind'] ?? 'invoice');
        $data['public_token'] = Str::random(40);

        return $data;
    }
}
