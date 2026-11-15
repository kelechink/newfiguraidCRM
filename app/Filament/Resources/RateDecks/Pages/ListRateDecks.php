<?php

namespace App\Filament\Resources\RateDecks\Pages;

use App\Filament\Resources\RateDecks\RateDeckResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListRateDecks extends ListRecords
{
    protected static string $resource = RateDeckResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
