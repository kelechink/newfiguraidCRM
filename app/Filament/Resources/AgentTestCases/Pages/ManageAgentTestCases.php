<?php

namespace App\Filament\Resources\AgentTestCases\Pages;

use App\Filament\Resources\AgentTestCases\AgentTestCaseResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageAgentTestCases extends ManageRecords
{
    protected static string $resource = AgentTestCaseResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
