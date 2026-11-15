<?php

namespace App\Filament\Resources\Pipelines\Pages;

use App\Filament\Resources\Pipelines\PipelineResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManagePipelines extends ManageRecords
{
    protected static string $resource = PipelineResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
