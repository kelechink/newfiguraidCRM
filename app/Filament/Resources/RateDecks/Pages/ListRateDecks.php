<?php

namespace App\Filament\Resources\RateDecks\Pages;

use App\Authz\Access;
use App\Filament\Resources\RateDecks\RateDeckResource;
use App\Models\Carrier;
use App\Models\StoredFile;
use App\Services\RateDeckService;
use Filament\Actions\Action;
use Filament\Actions\CreateAction;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ListRecords;
use Illuminate\Support\Facades\Storage;

class ListRateDecks extends ListRecords
{
    protected static string $resource = RateDeckResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Action::make('upload')->label('Upload rate sheet')->icon('heroicon-o-arrow-up-tray')
                ->visible(fn () => Access::can(auth()->user(), 'telecom.routes', 'create'))
                ->schema([
                    Select::make('carrier_id')->label('Carrier')->options(Carrier::orderBy('name')->pluck('name', 'id'))->searchable()->required()->live()
                        ->afterStateUpdated(fn ($state, callable $set) => $set('currency', Carrier::find($state)?->currency ?? 'USD')),
                    Select::make('direction')->options(fn () => array_filter(['sell' => 'Sell deck (to customer)', 'buy' => Access::can(auth()->user(), 'telecom.buy_rates', 'view') ? 'Vendor buy rates' : null]))->required()->default('sell'),
                    Select::make('currency')->options(['USD' => 'USD', 'EUR' => 'EUR', 'GBP' => 'GBP', 'NGN' => 'NGN'])->default('USD')->required(),
                    DatePicker::make('effective')->default(today())->required(),
                    TextInput::make('name')->placeholder('Optional deck name'),
                    FileUpload::make('file')->label('CSV or Excel')->disk('private')->directory('rate-sheets')->acceptedFileTypes(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])->maxSize(10240)->required(),
                ])
                ->action(function (array $data) {
                    if ($data['direction'] === 'buy') {
                        abort_unless(Access::can(auth()->user(), 'telecom.buy_rates', 'view'), 403);
                    }
                    $path = Storage::disk('private')->path($data['file']);
                    $f = StoredFile::create(['disk' => 'private', 'path' => $data['file'], 'original_name' => basename($data['file']), 'mime' => mime_content_type($path) ?: 'text/csv', 'size' => filesize($path), 'sha256' => hash_file('sha256', $path), 'purpose' => 'rate_sheet', 'uploaded_by_id' => auth()->id()]);
                    try {
                        $deck = app(RateDeckService::class)->import(Carrier::findOrFail($data['carrier_id']), $data['direction'], $data['currency'], $data['effective'], $path, $f->id, $data['name'] ?? null);
                        $v = $deck->validation;
                        $msg = "{$v['rows']} rates imported.";
                        if ($deck->direction === 'sell') {
                            $msg .= count($v['blocking']) ? ' '.count($v['blocking']).' route(s) below cost / minimum margin — this deck cannot be approved until fixed.' : ' All routes clear the minimum margin.';
                        } elseif ($v['compare']) {
                            $msg .= " Changes vs previous: {$v['compare']['increase']} up, {$v['compare']['decrease']} down, {$v['compare']['new']} new, {$v['compare']['removed']} removed.";
                        }
                        Notification::make()->title('Rate sheet processed')->body($msg)->{count($v['blocking'] ?? []) ? 'warning' : 'success'}()->persistent()->send();
                    } catch (\Throwable $e) {
                        Notification::make()->title('Could not read the sheet')->body($e->getMessage())->danger()->persistent()->send();
                    }
                }),
            CreateAction::make(),
        ];
    }
}
