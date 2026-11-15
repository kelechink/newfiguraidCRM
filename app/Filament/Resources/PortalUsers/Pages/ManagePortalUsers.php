<?php

namespace App\Filament\Resources\PortalUsers\Pages;

use App\Filament\Resources\PortalUsers\PortalUserResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManagePortalUsers extends ManageRecords
{
    protected static string $resource = PortalUserResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
