<?php

namespace App\Filament\Resources\LeaveRequests;

use App\Filament\Resources\LeaveRequests\Pages\ManageLeaveRequests;
use App\Models\LeaveRequest;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Textarea;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class LeaveRequestResource extends Resource
{
    use \App\Filament\Concerns\Scoped;

    protected static string $module = 'leave';

    protected static array $ownColumns = ['user_id'];

    protected static ?string $unitColumn = null;

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 3;

    protected static ?string $model = LeaveRequest::class;

    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-sun';

    protected static ?string $recordTitleAttribute = 'type';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('user_id')
                    ->relationship('user', 'name')
                    ->required(),
                TextInput::make('type')
                    ->required(),
                DatePicker::make('start_date')
                    ->required(),
                DatePicker::make('end_date')
                    ->required(),
                TextInput::make('days')
                    ->required()
                    ->numeric(),
                Textarea::make('reason')
                    ->default(null)
                    ->columnSpanFull(),
                TextInput::make('status')
                    ->required()
                    ->default('pending'),
                Select::make('approver_id')
                    ->relationship('approver', 'name'),
                DateTimePicker::make('decided_at'),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('type')
            ->columns([
                TextColumn::make('user.name')
                    ->searchable(),
                TextColumn::make('type')
                    ->searchable(),
                TextColumn::make('start_date')
                    ->date()
                    ->sortable(),
                TextColumn::make('end_date')
                    ->date()
                    ->sortable(),
                TextColumn::make('days')
                    ->numeric()
                    ->sortable(),
                TextColumn::make('status')
                    ->searchable(),
                TextColumn::make('approver.name')
                    ->searchable(),
                TextColumn::make('decided_at')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                //
            ])
            ->recordActions([
                \Filament\Actions\Action::make('approve')->label('Approve')->icon('heroicon-o-check')->color('success')
                    ->visible(fn ($record) => $record->status === 'pending' && $record->user_id !== auth()->id() && auth()->user()->canDo('leave', 'approve'))
                    ->action(function ($record) { $record->forceFill(['status' => 'approved', 'approver_id' => auth()->id(), 'decided_at' => now()])->save();
                        foreach (\Carbon\CarbonPeriod::create($record->start_date, $record->end_date) as $d) { app(\App\Services\AttendanceService::class)->recompute($record->user, $d->toDateString()); }
                        $record->user->notify(new \App\Notifications\Alert('Leave approved', $record->start_date->format('j M').' – '.$record->end_date->format('j M'))); }),
                \Filament\Actions\Action::make('decline')->label('Decline')->color('danger')
                    ->visible(fn ($record) => $record->status === 'pending' && $record->user_id !== auth()->id() && auth()->user()->canDo('leave', 'approve'))
                    ->action(fn ($record) => $record->forceFill(['status' => 'declined', 'approver_id' => auth()->id(), 'decided_at' => now()])->save()),
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
            'index' => ManageLeaveRequests::route('/'),
        ];
    }
}
