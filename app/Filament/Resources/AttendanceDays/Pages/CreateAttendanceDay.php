<?php

namespace App\Filament\Resources\AttendanceDays\Pages;

use App\Filament\Resources\AttendanceDays\AttendanceDayResource;
use Filament\Resources\Pages\CreateRecord;

class CreateAttendanceDay extends CreateRecord
{
    protected static string $resource = AttendanceDayResource::class;
}
