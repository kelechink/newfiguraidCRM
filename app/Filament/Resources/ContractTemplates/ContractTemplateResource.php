<?php

namespace App\Filament\Resources\ContractTemplates;

use App\Filament\Resources\ContractTemplates\Pages\CreateContractTemplate;
use App\Filament\Resources\ContractTemplates\Pages\EditContractTemplate;
use App\Filament\Resources\ContractTemplates\Pages\ListContractTemplates;
use App\Filament\Resources\ContractTemplates\Schemas\ContractTemplateForm;
use App\Filament\Resources\ContractTemplates\Tables\ContractTemplatesTable;
use App\Models\ContractTemplate;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class ContractTemplateResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'hr.contracts';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 8;

    protected static ?string $model = ContractTemplate::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-document-check';

    protected static ?string $recordTitleAttribute = 'title';

    public static function form(Schema $schema): Schema
    {
        return ContractTemplateForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return ContractTemplatesTable::configure($table);
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
            'index' => ListContractTemplates::route('/'),
            'create' => CreateContractTemplate::route('/create'),
            'edit' => EditContractTemplate::route('/{record}/edit'),
        ];
    }
}
