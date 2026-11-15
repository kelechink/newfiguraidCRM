<?php

namespace App\Filament\Resources\TaxRecords\Pages;

use App\Filament\Resources\TaxRecords\TaxRecordResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageTaxRecords extends ManageRecords
{
    protected static string $resource = TaxRecordResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
