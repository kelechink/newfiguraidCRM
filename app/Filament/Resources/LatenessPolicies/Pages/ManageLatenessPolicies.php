<?php

namespace App\Filament\Resources\LatenessPolicies\Pages;

use App\Filament\Resources\LatenessPolicies\LatenessPolicyResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageLatenessPolicies extends ManageRecords
{
    protected static string $resource = LatenessPolicyResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
