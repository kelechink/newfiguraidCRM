<?php

namespace App\Filament\Resources\ContractPacks\Pages;

use App\Filament\Resources\ContractPacks\ContractPackResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageContractPacks extends ManageRecords
{
    protected static string $resource = ContractPackResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
