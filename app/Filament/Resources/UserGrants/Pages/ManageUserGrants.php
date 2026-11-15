<?php

namespace App\Filament\Resources\UserGrants\Pages;

use App\Filament\Resources\UserGrants\UserGrantResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageUserGrants extends ManageRecords
{
    protected static string $resource = UserGrantResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
