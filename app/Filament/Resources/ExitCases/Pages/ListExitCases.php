<?php

namespace App\Filament\Resources\ExitCases\Pages;

use App\Filament\Resources\ExitCases\ExitCaseResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListExitCases extends ListRecords
{
    protected static string $resource = ExitCaseResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
