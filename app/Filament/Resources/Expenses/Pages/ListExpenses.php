<?php

namespace App\Filament\Resources\Expenses\Pages;

use App\Filament\Resources\Expenses\ExpenseResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ListRecords;

class ListExpenses extends ListRecords
{
    protected static string $resource = ExpenseResource::class;

    protected function getHeaderActions(): array
    {
        return [
            \App\Services\Exports::action('Expenses', 'finance.expenses', fn () => \App\Filament\Resources\Expenses\ExpenseResource::getEloquentQuery(), ['Date' => 'date', 'Description' => 'description', 'Category' => 'category.name', 'Amount' => 'amount', 'Currency' => 'currency', 'Naira' => 'amount_ngn', 'Status' => 'status']),
            CreateAction::make(),
        ];
    }
}
