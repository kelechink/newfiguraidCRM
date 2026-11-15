<?php

namespace App\Filament\Resources\AgentTestCases;

use App\Filament\Resources\AgentTestCases\Pages\ManageAgentTestCases;
use App\Models\AgentTestCase;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class AgentTestCaseResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'inbox.routing';

    protected static array $ownColumns = [];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'AI team';

    protected static ?int $navigationSort = 5;

    protected static ?string $navigationLabel = 'Agent test suite';

    protected static ?string $model = AgentTestCase::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-beaker';

    protected static ?string $recordTitleAttribute = 'question';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('agent_key')
                    ->required(),
                Textarea::make('question')
                    ->required()
                    ->columnSpanFull(),
                Textarea::make('must_include')
                    ->default(null)
                    ->columnSpanFull(),
                Textarea::make('must_not_include')
                    ->default(null)
                    ->columnSpanFull(),
                Toggle::make('last_passed'),
                DateTimePicker::make('last_run_at'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('question')
            ->columns([
                TextColumn::make('agent_key')
                    ->searchable(),
                IconColumn::make('last_passed')
                    ->boolean(),
                TextColumn::make('last_run_at')
                    ->dateTime()
                    ->sortable(),
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
            'index' => ManageAgentTestCases::route('/'),
        ];
    }
}
