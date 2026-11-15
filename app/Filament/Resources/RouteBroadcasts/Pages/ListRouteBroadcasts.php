<?php

namespace App\Filament\Resources\RouteBroadcasts\Pages;

use App\Filament\Resources\RouteBroadcasts\RouteBroadcastResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListRouteBroadcasts extends ListRecords
{
    protected static string $resource = RouteBroadcastResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
