<?php

namespace App\Filament\Resources\KbArticles;

use App\Filament\Resources\KbArticles\Pages\CreateKbArticle;
use App\Filament\Resources\KbArticles\Pages\EditKbArticle;
use App\Filament\Resources\KbArticles\Pages\ListKbArticles;
use App\Filament\Resources\KbArticles\Schemas\KbArticleForm;
use App\Filament\Resources\KbArticles\Tables\KbArticlesTable;
use App\Models\KbArticle;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

class KbArticleResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'kb';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = 'unit_id';

    protected static string|\UnitEnum|null $navigationGroup = 'AI team';

    protected static ?int $navigationSort = 4;

    protected static ?string $navigationLabel = 'Knowledge base';

    protected static ?string $model = KbArticle::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-book-open';

    protected static ?string $recordTitleAttribute = 'title';

    public static function form(Schema $schema): Schema
    {
        return KbArticleForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return KbArticlesTable::configure($table);
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
            'index' => ListKbArticles::route('/'),
            'create' => CreateKbArticle::route('/create'),
            'edit' => EditKbArticle::route('/{record}/edit'),
        ];
    }
}
