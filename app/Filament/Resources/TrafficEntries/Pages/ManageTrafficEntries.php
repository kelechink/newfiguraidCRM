<?php

namespace App\Filament\Resources\TrafficEntries\Pages;

use App\Filament\Resources\TrafficEntries\TrafficEntryResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageTrafficEntries extends ManageRecords
{
    protected static string $resource = TrafficEntryResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
