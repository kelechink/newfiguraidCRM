<?php

namespace App\Filament\Resources\Payments\Pages;

use App\Filament\Resources\Payments\PaymentResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListPayments extends ListRecords
{
    protected static string $resource = PaymentResource::class;

    protected function getHeaderActions(): array
    {
        return [
            \App\Services\Exports::action('Payments', 'finance.income', fn () => \App\Filament\Resources\Payments\PaymentResource::getEloquentQuery(), ['Gateway' => 'gateway', 'Reference' => 'reference', 'Amount' => 'amount', 'Currency' => 'currency', 'Naira' => 'amount_ngn', 'Paid' => 'paid_at', 'Status' => 'status']),
            CreateAction::make(),
        ];
    }
}
