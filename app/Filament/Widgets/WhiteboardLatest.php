<?php

namespace App\Filament\Widgets;

use App\Models\WhiteboardPost;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget;

/** Latest Whiteboard posts on everyone's dashboard. */
class WhiteboardLatest extends TableWidget
{
    protected static ?int $sort = 3;

    protected int|string|array $columnSpan = 'full';

    protected ?string $pollingInterval = '60s';

    public function table(Table $table): Table
    {
        return $table->heading('Whiteboard')->query(WhiteboardPost::live()->with('subject')->latest())->paginated([5])->defaultPaginationPageOption(5)
            ->recordUrl(fn () => '/app/whiteboard')
            ->columns([
                TextColumn::make('hashtags')->label('')->formatStateUsing(fn ($state) => '#'.$state)->badge()->color(fn ($record) => $record->kind === 'kudos' ? 'success' : 'danger'),
                TextColumn::make('subject.name')->label('Who')->weight('bold'),
                TextColumn::make('body')->label('')->limit(80),
                TextColumn::make('created_at')->since()->label('When'),
            ]);
    }
}
