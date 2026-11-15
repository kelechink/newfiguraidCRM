<?php

namespace App\Filament\Resources\Rfqs;

use App\Filament\Resources\Rfqs\Pages\CreateRfq;
use App\Filament\Resources\Rfqs\Pages\EditRfq;
use App\Filament\Resources\Rfqs\Pages\ListRfqs;
use App\Filament\Resources\Rfqs\Schemas\RfqForm;
use App\Filament\Resources\Rfqs\Tables\RfqsTable;
use App\Models\Rfq;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class RfqResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'procurement';

    protected static array $ownColumns = ['owner_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Procurement';

    protected static ?int $navigationSort = 1;

    protected static ?string $navigationLabel = 'RFQs';

    protected static ?string $model = Rfq::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-clipboard-document-list';

    protected static ?string $recordTitleAttribute = 'title';

    public static function form(Schema $schema): Schema
    {
        return RfqForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return RfqsTable::configure($table);
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
            'index' => ListRfqs::route('/'),
            'create' => CreateRfq::route('/create'),
            'edit' => EditRfq::route('/{record}/edit'),
        ];
    }
}
