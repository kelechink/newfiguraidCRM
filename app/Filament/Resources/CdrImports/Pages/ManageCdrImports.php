<?php

namespace App\Filament\Resources\CdrImports\Pages;

use App\Authz\Access;
use App\Filament\Resources\CdrImports\CdrImportResource;
use App\Models\Carrier;
use App\Models\StoredFile;
use App\Services\CdrService;
use App\Services\RateDeckService;
use Filament\Actions\Action;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Select;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ManageRecords;
use Illuminate\Support\Facades\Storage;

class ManageCdrImports extends ManageRecords
{
    protected static string $resource = CdrImportResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Action::make('upload')->label('Upload CDRs')->icon('heroicon-o-arrow-up-tray')
                ->visible(fn () => Access::can(auth()->user(), 'telecom.traffic', 'create'))
                ->modalDescription('CSV or Excel with call start, dialled number and duration (seconds). Each call is rated on the customer\'s active sell deck with its billing increments; totals land in Traffic & minutes.')
                ->schema([
                    Select::make('carrier_id')->label('Customer')->options(Carrier::whereIn('role', ['customer', 'both'])->orderBy('name')->pluck('name', 'id'))->required()->searchable(),
                    Select::make('route_type')->options(RateDeckService::ROUTE_TYPES)->default('cli')->required(),
                    FileUpload::make('file')->disk('private')->directory('cdrs')->maxSize(51200)->required()
                        ->acceptedFileTypes(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
                ])
                ->action(function (array $data) {
                    $path = Storage::disk('private')->path($data['file']);
                    $f = StoredFile::create(['disk' => 'private', 'path' => $data['file'], 'original_name' => basename($data['file']), 'mime' => 'text/csv', 'size' => filesize($path), 'sha256' => hash_file('sha256', $path), 'purpose' => 'cdr', 'uploaded_by_id' => auth()->id()]);
                    $imp = app(CdrService::class)->import(Carrier::findOrFail($data['carrier_id']), $path, auth()->id(), $f->id, $data['route_type']);
                    Notification::make()->title('CDRs rated')->body(number_format($imp->calls).' calls, '.number_format((float) $imp->billed_minutes, 2).' billed minutes. '.$imp->unrated.' calls had no matching sell rate; '.count($imp->errors ?? []).' bad lines.')->{$imp->unrated ? 'warning' : 'success'}()->persistent()->send();
                }),
        ];
    }
}
