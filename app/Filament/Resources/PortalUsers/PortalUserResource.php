<?php

namespace App\Filament\Resources\PortalUsers;

use App\Filament\Resources\PortalUsers\Pages\ManagePortalUsers;
use App\Models\PortalUser;
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

class PortalUserResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'settings';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Admin';

    protected static ?int $navigationSort = 11;

    protected static ?string $navigationLabel = 'Portal users';

    protected static ?string $model = PortalUser::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-globe-europe-africa';

    protected static ?string $recordTitleAttribute = 'email';

    public static function canCreate(): bool
    {
        return false; // invite from the customer's page; customers set their own password
    }

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('contact_id')
                    ->relationship('contact', 'id')
                    ->required(),
                Select::make('carrier_id')
                    ->relationship('carrier', 'name'),
                TextInput::make('email')
                    ->label('Email address')
                    ->email()
                    ->required(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('email')
            ->columns([
                TextColumn::make('contact.id')
                    ->searchable(),
                TextColumn::make('carrier.name')
                    ->searchable(),
                TextColumn::make('email')
                    ->label('Email address')
                    ->searchable(),
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
            'index' => ManagePortalUsers::route('/'),
        ];
    }
}
