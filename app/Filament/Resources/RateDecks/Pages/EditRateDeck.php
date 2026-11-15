<?php

namespace App\Filament\Resources\RateDecks\Pages;

use App\Filament\Resources\RateDecks\RateDeckResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditRateDeck extends EditRecord
{
    protected static string $resource = RateDeckResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}
