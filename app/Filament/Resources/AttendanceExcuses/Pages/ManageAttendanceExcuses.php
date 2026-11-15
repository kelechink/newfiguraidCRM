<?php

namespace App\Filament\Resources\AttendanceExcuses\Pages;

use App\Filament\Resources\AttendanceExcuses\AttendanceExcuseResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageAttendanceExcuses extends ManageRecords
{
    protected static string $resource = AttendanceExcuseResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
