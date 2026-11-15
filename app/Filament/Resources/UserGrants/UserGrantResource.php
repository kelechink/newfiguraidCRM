<?php

namespace App\Filament\Resources\UserGrants;

use App\Filament\Resources\UserGrants\Pages\ManageUserGrants;
use App\Models\UserGrant;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class UserGrantResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'roles';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Admin';

    protected static ?int $navigationSort = 3;

    protected static ?string $navigationLabel = 'Temporary grants';

    protected static ?string $model = UserGrant::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-lock-open';

    protected static ?string $recordTitleAttribute = 'module';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('user_id')
                    ->relationship('user', 'name')
                    ->required(),
                TextInput::make('module')
                    ->required(),
                TextInput::make('action')
                    ->required(),
                TextInput::make('scope')
                    ->required(),
                DateTimePicker::make('expires_at'),
                TextInput::make('reason')
                    ->default(null),
                Select::make('granted_by_id')
                    ->relationship('grantedBy', 'name')
                    ->required(),
                DateTimePicker::make('revoked_at'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('module')
            ->columns([
                TextColumn::make('user.name')
                    ->searchable(),
                TextColumn::make('module')
                    ->searchable(),
                TextColumn::make('action')
                    ->searchable(),
                TextColumn::make('scope')
                    ->searchable(),
                TextColumn::make('expires_at')
                    ->dateTime()
                    ->sortable(),
                TextColumn::make('reason')
                    ->searchable(),
                TextColumn::make('grantedBy.name')
                    ->searchable(),
                TextColumn::make('revoked_at')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
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
            'index' => ManageUserGrants::route('/'),
        ];
    }
}
