<?php

namespace App\Filament\Resources\MarginRules\Pages;

use App\Filament\Resources\MarginRules\MarginRuleResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageMarginRules extends ManageRecords
{
    protected static string $resource = MarginRuleResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make(),
        ];
    }
}
