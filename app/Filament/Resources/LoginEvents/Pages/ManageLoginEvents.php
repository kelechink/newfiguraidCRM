<?php

namespace App\Filament\Resources\LoginEvents\Pages;

use App\Filament\Resources\LoginEvents\LoginEventResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageLoginEvents extends ManageRecords
{
    protected static string $resource = LoginEventResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
