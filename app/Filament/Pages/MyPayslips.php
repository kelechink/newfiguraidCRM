<?php

namespace App\Filament\Pages;

use App\Models\Payslip;
use BackedEnum;
use Filament\Pages\Page;

/** Staff self-service: your own payslips once payroll is signed off. */
class MyPayslips extends Page
{
    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-document-text';

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 1;

    protected static ?string $slug = 'my-payslips';

    protected static ?string $title = 'My payslips';

    protected string $view = 'filament.pages.my-payslips';

    public static function canAccess(): bool
    {
        return (bool) auth()->user()?->staffProfile;
    }

    protected function getViewData(): array
    {
        return ['slips' => Payslip::where('user_id', auth()->id())->whereHas('payrollRun', fn ($q) => $q->whereIn('status', ['signed_off', 'paid']))->with('payrollRun')->get()->sortByDesc(fn ($s) => $s->payrollRun->period_month)];
    }
}
