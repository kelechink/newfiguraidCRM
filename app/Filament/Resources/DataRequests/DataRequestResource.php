<?php

namespace App\Filament\Resources\DataRequests;

use App\Filament\Resources\DataRequests\Pages\ManageDataRequests;
use App\Models\DataRequest;
use App\Services\DataRights;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Forms\Components\Textarea;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

/** NDPA data-subject requests: verified by email, answered within 30 days, every step audited. */
class DataRequestResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'privacy.dsr';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Admin';

    protected static ?int $navigationSort = 12;

    protected static ?string $navigationLabel = 'Data-rights requests';

    protected static ?string $model = DataRequest::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-shield-check';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function form(Schema $schema): Schema
    {
        return $schema->components([]);
    }

    public static function table(Table $table): Table
    {
        return $table->defaultSort('created_at', 'desc')->columns([
            TextColumn::make('created_at')->date('j M Y')->label('Received'),
            TextColumn::make('kind')->badge(),
            TextColumn::make('name')->description(fn ($record) => $record->email),
            TextColumn::make('contact.display_name')->label('Matched customer')->placeholder('No match'),
            TextColumn::make('status')->badge()->color(fn ($state) => match ($state) { 'completed' => 'success', 'verified' => 'warning', 'rejected' => 'gray', default => 'info' }),
            TextColumn::make('due_on')->date('j M Y')->color(fn ($record) => $record->status !== 'completed' && $record->due_on->isPast() ? 'danger' : null),
            TextColumn::make('details')->limit(60)->toggleable(isToggledHiddenByDefault: true),
        ])->recordActions([
            Action::make('export')->label('Download their data')->icon('heroicon-o-arrow-down-tray')->visible(fn ($record) => $record->status === 'verified')
                ->action(fn ($record) => response()->streamDownload(fn () => print(json_encode(app(DataRights::class)->export($record), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)), 'data-'.$record->id.'.json')),
            Action::make('erase')->label('Erase personal data')->color('danger')->icon('heroicon-o-trash')->requiresConfirmation()
                ->modalDescription('Removes name, email, phone, messages and form data, and stops marketing. Invoices and payments are kept (tax law) without contact details. This cannot be undone.')
                ->visible(fn ($record) => $record->status === 'verified' && in_array($record->kind, ['delete', 'withdraw']) && auth()->user()->canDo('privacy.dsr', 'delete'))
                ->action(function ($record) {
                    app(DataRights::class)->erase($record);
                    Notification::make()->title('Erased and closed')->success()->send();
                }),
            Action::make('complete')->label('Mark completed')->color('success')->visible(fn ($record) => $record->status === 'verified')
                ->schema([Textarea::make('outcome')->label('What you did / told them')->required()])
                ->action(fn ($record, array $data) => $record->forceFill(['status' => 'completed', 'handled_by_id' => auth()->id(), 'outcome' => $data['outcome']])->save()),
            Action::make('reject')->label('Reject')->color('gray')->visible(fn ($record) => in_array($record->status, ['received', 'verified']))
                ->schema([Textarea::make('outcome')->label('Reason (must be lawful)')->required()])
                ->action(fn ($record, array $data) => $record->forceFill(['status' => 'rejected', 'handled_by_id' => auth()->id(), 'outcome' => $data['outcome']])->save()),
        ]);
    }

    public static function getPages(): array
    {
        return ['index' => ManageDataRequests::route('/')];
    }
}
