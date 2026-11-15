<?php

namespace App\Filament\Resources\AttendanceDays\Pages;

use App\Filament\Resources\AttendanceDays\AttendanceDayResource;
use Filament\Actions\DeleteAction;
use Filament\Resources\Pages\EditRecord;

class EditAttendanceDay extends EditRecord
{
    protected static string $resource = AttendanceDayResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }
}
