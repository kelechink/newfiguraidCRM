<?php

namespace App\Filament\Resources\BankTransactions\Pages;

use App\Authz\Access;
use App\Filament\Resources\BankTransactions\BankTransactionResource;
use App\Models\BankAccount;
use App\Services\BankMatcher;
use Filament\Actions\Action;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Select;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ListRecords;
use Filament\Schemas\Components\Tabs\Tab;
use Illuminate\Support\Facades\Storage;

class ListBankTransactions extends ListRecords
{
    protected static string $resource = BankTransactionResource::class;

    public function getTabs(): array
    {
        return [
            'review' => Tab::make('Review queue')->modifyQueryUsing(fn ($query) => $query->whereIn('match_status', ['suggested', 'unmatched'])->where('amount', '>', 0)),
            'matched' => Tab::make('Matched')->modifyQueryUsing(fn ($query) => $query->where('match_status', 'matched')),
            'all' => Tab::make('All'),
        ];
    }

    protected function getHeaderActions(): array
    {
        return [
            Action::make('upload')->label('Upload bank statement')->icon('heroicon-o-arrow-up-tray')
                ->visible(fn () => Access::can(auth()->user(), 'finance.bank', 'create'))
                ->schema([
                    Select::make('bank_account_id')->label('Account')->options(BankAccount::pluck('name', 'id'))->required(),
                    FileUpload::make('file')->label('CSV or Excel export from the bank')->disk('private')->directory('bank-statements')->maxSize(10240)
                        ->acceptedFileTypes(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])->required(),
                ])
                ->action(function (array $data) {
                    $r = app(BankMatcher::class)->import(BankAccount::findOrFail($data['bank_account_id']), Storage::disk('private')->path($data['file']));
                    Notification::make()->title('Statement imported')->body("{$r['added']} new lines ({$r['dupes']} already loaded). Auto-matched {$r['auto']}, {$r['suggested']} waiting for review.")->success()->persistent()->send();
                }),
        ];
    }
}
