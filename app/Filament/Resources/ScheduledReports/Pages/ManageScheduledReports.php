<?php

namespace App\Filament\Resources\ScheduledReports\Pages;

use App\Filament\Resources\ScheduledReports\ScheduledReportResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageScheduledReports extends ManageRecords
{
    protected static string $resource = ScheduledReportResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
