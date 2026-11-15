<?php

namespace App\Filament\Resources\RouteRequests\Pages;

use App\Filament\Resources\RouteRequests\RouteRequestResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageRouteRequests extends ManageRecords
{
    protected static string $resource = RouteRequestResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
