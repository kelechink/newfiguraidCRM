<?php

namespace App\Filament\Resources\AiActions\Pages;

use App\Filament\Resources\AiActions\AiActionResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditAiAction extends EditRecord
{
    protected static string $resource = AiActionResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}
