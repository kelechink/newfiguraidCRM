<?php

namespace App\Filament\Resources\FraudAlerts\Pages;

use App\Filament\Resources\FraudAlerts\FraudAlertResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageFraudAlerts extends ManageRecords
{
    protected static string $resource = FraudAlertResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
