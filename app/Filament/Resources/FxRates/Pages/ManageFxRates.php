<?php

namespace App\Filament\Resources\FxRates\Pages;

use App\Filament\Resources\FxRates\FxRateResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageFxRates extends ManageRecords
{
    protected static string $resource = FxRateResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
