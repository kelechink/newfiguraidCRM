<?php

namespace App\Filament\Resources\AttendanceDays\Pages;

use App\Filament\Resources\AttendanceDays\AttendanceDayResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListAttendanceDays extends ListRecords
{
    protected static string $resource = AttendanceDayResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
