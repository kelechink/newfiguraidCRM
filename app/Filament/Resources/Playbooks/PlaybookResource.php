<?php

namespace App\Filament\Resources\Playbooks;

use App\Filament\Resources\Playbooks\Pages\CreatePlaybook;
use App\Filament\Resources\Playbooks\Pages\EditPlaybook;
use App\Filament\Resources\Playbooks\Pages\ListPlaybooks;
use App\Filament\Resources\Playbooks\Schemas\PlaybookForm;
use App\Filament\Resources\Playbooks\Tables\PlaybooksTable;
use App\Models\Playbook;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class PlaybookResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'playbooks';

    protected static array $ownColumns = ['owner_id'];

    protected static ?string $unitColumn = 'unit_id';

    protected static string|\UnitEnum|null $navigationGroup = 'Today';

    protected static ?int $navigationSort = 3;

    protected static ?string $model = Playbook::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-book-open';

    protected static ?string $recordTitleAttribute = 'title';

    public static function form(Schema $schema): Schema
    {
        return PlaybookForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return PlaybooksTable::configure($table);
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
            'index' => ListPlaybooks::route('/'),
            'create' => CreatePlaybook::route('/create'),
            'edit' => EditPlaybook::route('/{record}/edit'),
        ];
    }
}
