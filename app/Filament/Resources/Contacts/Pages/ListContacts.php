<?php

namespace App\Filament\Resources\Contacts\Pages;

use App\Authz\Access;
use App\Filament\Resources\Contacts\ContactResource;
use App\Models\BusinessUnit;
use App\Services\ContactImporter;
use Filament\Actions\Action;
use Filament\Actions\CreateAction;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\TextInput;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ListRecords;
use Illuminate\Support\Facades\Storage;

class ListContacts extends ListRecords
{
    protected static string $resource = ContactResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Action::make('import')->label('Import spreadsheet')->icon('heroicon-o-arrow-up-tray')->color('gray')
                ->visible(fn () => Access::can(auth()->user(), 'crm.contacts', 'create'))
                ->modalDescription('CSV or Excel with columns like Name, Email, Phone, Company, Tags. Existing people (same email or phone) are updated, not duplicated.')
                ->schema([
                    FileUpload::make('file')->disk('private')->directory('imports')->maxSize(10240)->required()
                        ->acceptedFileTypes(['text/csv', 'text/plain', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
                    Select::make('unit_id')->label('Business unit')->options(BusinessUnit::pluck('name', 'id'))->default(auth()->user()->primary_unit_id)->required(),
                    TagsInput::make('tags')->default(['Carrier Community'])->helperText('Added to everyone in the file.'),
                    TextInput::make('source')->default('Carrier Community list')->required(),
                ])
                ->action(function (array $data) {
                    $r = app(ContactImporter::class)->import(Storage::disk('private')->path($data['file']), $data['unit_id'], $data['tags'] ?? [], $data['source'], auth()->id());
                    Storage::disk('private')->delete($data['file']);
                    Notification::make()->title('Import finished')->body("{$r['created']} added, {$r['updated']} updated, {$r['skipped']} skipped (no email or phone).")->success()->send();
                }),
            \App\Services\Exports::action('Customers', 'crm.contacts', fn () => \App\Filament\Resources\Contacts\ContactResource::getEloquentQuery(), ['Name' => 'display_name', 'Email' => 'email', 'Phone' => 'phone', 'Company' => 'company.name', 'Stage' => 'lifecycle', 'Tags' => 'tags', 'Source' => 'source_channel', 'Created' => 'created_at']),
            CreateAction::make(),
        ];
    }
}
