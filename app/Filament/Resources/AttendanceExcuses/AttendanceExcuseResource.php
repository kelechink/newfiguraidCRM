<?php

namespace App\Filament\Resources\AttendanceExcuses;

use App\Filament\Resources\AttendanceExcuses\Pages\ManageAttendanceExcuses;
use App\Models\AttendanceExcuse;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class AttendanceExcuseResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'attendance.review';

    protected static array $ownColumns = ['user_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 4;

    protected static ?string $navigationLabel = 'Excuses';

    protected static ?string $model = AttendanceExcuse::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-chat-bubble-left-ellipsis';

    protected static ?string $recordTitleAttribute = 'reason';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('attendance_day_id')
                    ->relationship('attendanceDay', 'id')
                    ->required(),
                Select::make('user_id')
                    ->relationship('user', 'name')
                    ->required(),
                Textarea::make('reason')
                    ->required()
                    ->columnSpanFull(),
                TextInput::make('file_id')
                    ->default(null),
                TextInput::make('status')
                    ->required()
                    ->default('pending'),
                Select::make('reviewer_id')
                    ->relationship('reviewer', 'name'),
                DateTimePicker::make('decided_at'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('reason')
            ->columns([
                TextColumn::make('attendanceDay.id')
                    ->searchable(),
                TextColumn::make('user.name')
                    ->searchable(),
                TextColumn::make('file_id')
                    ->searchable(),
                TextColumn::make('status')
                    ->searchable(),
                TextColumn::make('reviewer.name')
                    ->searchable(),
                TextColumn::make('decided_at')
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
            'index' => ManageAttendanceExcuses::route('/'),
        ];
    }
}
