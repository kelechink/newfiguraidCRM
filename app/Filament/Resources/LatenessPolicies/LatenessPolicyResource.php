<?php

namespace App\Filament\Resources\LatenessPolicies;

use App\Filament\Resources\LatenessPolicies\Pages\ManageLatenessPolicies;
use App\Models\LatenessPolicy;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class LatenessPolicyResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'hr.deductions';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 11;

    protected static ?string $model = LatenessPolicy::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-cog-6-tooth';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->required(),
                Select::make('unit_id')
                    ->relationship('unit', 'name'),
                TextInput::make('lateness_mode')
                    ->required()
                    ->default('fixed'),
                TextInput::make('fixed_amount')
                    ->numeric()
                    ->default(null),
                Textarea::make('tiers')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('early_leave_amount')
                    ->numeric()
                    ->default(null),
                TextInput::make('absence_mode')
                    ->required()
                    ->default('fixed'),
                TextInput::make('absence_amount')
                    ->numeric()
                    ->default(null),
                TextInput::make('monthly_cap_amount')
                    ->numeric()
                    ->default(null),
                TextInput::make('monthly_cap_pct')
                    ->numeric()
                    ->default(null),
                DatePicker::make('effective_from')
                    ->required(),
                TextInput::make('document_version')
                    ->default(null),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('name')
            ->columns([
                TextColumn::make('name')
                    ->searchable(),
                TextColumn::make('unit.name')
                    ->searchable(),
                TextColumn::make('lateness_mode')
                    ->searchable(),
                TextColumn::make('fixed_amount')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('early_leave_amount')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('absence_mode')
                    ->searchable(),
                TextColumn::make('absence_amount')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('monthly_cap_amount')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('monthly_cap_pct')
                    ->numeric()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('effective_from')
                    ->date()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('document_version')
                    ->searchable()
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
            'index' => ManageLatenessPolicies::route('/'),
        ];
    }
}
