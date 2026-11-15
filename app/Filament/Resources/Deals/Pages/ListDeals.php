<?php

namespace App\Filament\Resources\Deals\Pages;

use App\Filament\Resources\Deals\DealResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListDeals extends ListRecords
{
    protected static string $resource = DealResource::class;

    protected function getHeaderActions(): array
    {
        return [
            \App\Services\Exports::action('Deals', 'crm.deals', fn () => \App\Filament\Resources\Deals\DealResource::getEloquentQuery(), ['Title' => 'title', 'Stage' => 'stage.name', 'Value' => 'value', 'Currency' => 'currency', 'Status' => 'status', 'Owner' => 'owner.name', 'Expected close' => 'expected_close_on']),
            CreateAction::make(),
        ];
    }
}
