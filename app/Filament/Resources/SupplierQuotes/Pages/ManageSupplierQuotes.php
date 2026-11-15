<?php

namespace App\Filament\Resources\SupplierQuotes\Pages;

use App\Filament\Resources\SupplierQuotes\SupplierQuoteResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageSupplierQuotes extends ManageRecords
{
    protected static string $resource = SupplierQuoteResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
