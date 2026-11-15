<?php

namespace App\Filament\Resources\AiAgents;

use App\Filament\Resources\AiAgents\Pages\CreateAiAgent;
use App\Filament\Resources\AiAgents\Pages\EditAiAgent;
use App\Filament\Resources\AiAgents\Pages\ListAiAgents;
use App\Filament\Resources\AiAgents\Schemas\AiAgentForm;
use App\Filament\Resources\AiAgents\Tables\AiAgentsTable;
use App\Models\AiAgent;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class AiAgentResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'inbox.routing';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'AI team';

    protected static ?int $navigationSort = 1;

    protected static ?string $navigationLabel = 'AI agents';

    protected static ?string $model = AiAgent::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-sparkles';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return AiAgentForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return AiAgentsTable::configure($table);
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
            'index' => ListAiAgents::route('/'),
            'create' => CreateAiAgent::route('/create'),
            'edit' => EditAiAgent::route('/{record}/edit'),
        ];
    }
}
