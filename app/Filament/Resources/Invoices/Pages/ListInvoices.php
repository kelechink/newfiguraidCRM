<?php

namespace App\Filament\Resources\Invoices\Pages;

use App\Filament\Resources\Invoices\InvoiceResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListInvoices extends ListRecords
{
    protected static string $resource = InvoiceResource::class;

    protected function getHeaderActions(): array
    {
        return [
            \App\Services\Exports::action('Invoices', 'finance.invoices', fn () => \App\Filament\Resources\Invoices\InvoiceResource::getEloquentQuery(), ['Number' => 'number', 'Customer' => fn ($r) => $r->carrier?->name ?? $r->contact?->display_name, 'Currency' => 'currency', 'Total' => 'total', 'Paid' => 'amount_paid', 'Status' => 'status', 'Issued' => 'issue_date', 'Due' => 'due_date', 'Parallel rate' => 'fx_rate', 'Official rate' => 'fx_rate_official']),
            CreateAction::make(),
        ];
    }
}
