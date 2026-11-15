<?php

namespace App\Filament\Resources\LeadForms\Pages;

use App\Filament\Resources\LeadForms\LeadFormResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageLeadForms extends ManageRecords
{
    protected static string $resource = LeadFormResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
