<?php

namespace App\Filament\Resources\PayrollRuns\Schemas;

use Filament\Forms\Components\Hidden;
use Filament\Forms\Components\TextInput;
use Filament\Schemas\Schema;

class PayrollRunForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema->components([
            TextInput::make('period_month')->label('Month (YYYY-MM)')->default(now()->format('Y-m'))->regex('/^\d{4}-\d{2}$/')->unique(ignoreRecord: true)->required()->disabledOn('edit'),
            Hidden::make('prepared_by_id')->default(fn () => auth()->id()),
            Hidden::make('status')->default('draft'),
        ]);
    }
}
