<?php

namespace App\Filament\Resources\ExitCases\Pages;

use App\Filament\Resources\ExitCases\ExitCaseResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditExitCase extends EditRecord
{
    protected static string $resource = ExitCaseResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}
