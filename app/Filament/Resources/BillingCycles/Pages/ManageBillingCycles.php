<?php

namespace App\Filament\Resources\BillingCycles\Pages;

use App\Filament\Resources\BillingCycles\BillingCycleResource;
use Filament\Resources\Pages\ManageRecords;

class ManageBillingCycles extends ManageRecords
{
    protected static string $resource = BillingCycleResource::class;

    protected function getHeaderActions(): array
    {
        return [];
    }
}
