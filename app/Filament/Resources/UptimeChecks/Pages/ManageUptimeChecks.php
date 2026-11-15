<?php

namespace App\Filament\Resources\UptimeChecks\Pages;

use App\Filament\Resources\UptimeChecks\UptimeCheckResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageUptimeChecks extends ManageRecords
{
    protected static string $resource = UptimeCheckResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
