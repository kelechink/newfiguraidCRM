<?php

namespace App\Filament\Resources\CdrImports;

use App\Filament\Resources\CdrImports\Pages\ManageCdrImports;
use App\Models\CdrImport;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class CdrImportResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'telecom.traffic';

    protected static array $ownColumns = ['uploaded_by_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Telecom';

    protected static ?int $navigationSort = 9;

    protected static ?string $navigationLabel = 'CDR uploads';

    protected static ?string $model = CdrImport::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-document-arrow-up';

    protected static ?string $recordTitleAttribute = 'id';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function canEdit(\Illuminate\Database\Eloquent\Model $record): bool
    {
        return false;
    }

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('carrier_id')
                    ->relationship('carrier', 'name')
                    ->required(),
                Select::make('file_id')
                    ->relationship('file', 'id'),
                TextInput::make('calls')
                    ->required()
                    ->numeric()
                    ->default(0),
                TextInput::make('billed_minutes')
                    ->required()
                    ->numeric()
                    ->default(0.0),
                TextInput::make('unrated')
                    ->required()
                    ->numeric()
                    ->default(0),
                Textarea::make('errors')
                    ->default(null)
                    ->columnSpanFull(),
                Select::make('uploaded_by_id')
                    ->relationship('uploadedBy', 'name')
                    ->required(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('id')
            ->columns([
                \Filament\Tables\Columns\TextColumn::make('created_at')->dateTime('j M Y H:i')->label('Uploaded'),
                \Filament\Tables\Columns\TextColumn::make('carrier.name'),
                \Filament\Tables\Columns\TextColumn::make('calls')->numeric(),
                \Filament\Tables\Columns\TextColumn::make('billed_minutes')->numeric(2),
                \Filament\Tables\Columns\TextColumn::make('unrated')->numeric()->color(fn ($state) => $state ? 'warning' : null),
                \Filament\Tables\Columns\TextColumn::make('uploadedBy.name')->label('By'),
            ])->defaultSort('created_at', 'desc')
            ->filters([
                //
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageCdrImports::route('/'),
        ];
    }
}
