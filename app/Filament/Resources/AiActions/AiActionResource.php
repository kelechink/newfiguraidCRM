<?php

namespace App\Filament\Resources\AiActions;

use App\Filament\Resources\AiActions\Pages\CreateAiAction;
use App\Filament\Resources\AiActions\Pages\EditAiAction;
use App\Filament\Resources\AiActions\Pages\ListAiActions;
use App\Filament\Resources\AiActions\Schemas\AiActionForm;
use App\Filament\Resources\AiActions\Tables\AiActionsTable;
use App\Models\AiAction;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class AiActionResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'inbox.routing';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'AI team';

    protected static ?int $navigationSort = 2;

    protected static ?string $navigationLabel = 'AI activity & approvals';

    protected static ?string $model = AiAction::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-bolt';

    protected static ?string $recordTitleAttribute = 'kind';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function form(Schema $schema): Schema
    {
        return AiActionForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return AiActionsTable::configure($table);
    }

    public static function getRelations(): array
    {
        return [
            //
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListAiActions::route('/'),
            'create' => CreateAiAction::route('/create'),
            'edit' => EditAiAction::route('/{record}/edit'),
        ];
    }
}
