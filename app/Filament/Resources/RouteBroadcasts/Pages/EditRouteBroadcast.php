<?php

namespace App\Filament\Resources\RouteBroadcasts\Pages;

use App\Filament\Resources\RouteBroadcasts\RouteBroadcastResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditRouteBroadcast extends EditRecord
{
    protected static string $resource = RouteBroadcastResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}
