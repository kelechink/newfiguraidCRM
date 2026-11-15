<?php

namespace App\Filament\Widgets;

use App\Models\AiAgent;
use Filament\Tables\Columns\ColorColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget;

/** Live activity of the AI team on the staff dashboard. */
class AiTeamActivity extends TableWidget
{
    protected static ?int $sort = 4;

    protected int|string|array $columnSpan = 'full';

    protected ?string $pollingInterval = '30s';

    public function table(Table $table): Table
    {
        return $table->heading('AI team')->query(AiAgent::query()->orderBy('name'))->paginated(false)->columns([
            ColorColumn::make('color')->label(''),
            TextColumn::make('name')->weight('bold')->description(fn ($r) => $r->role),
            TextColumn::make('status')->badge()->color(fn ($s) => $s === 'active' ? 'success' : 'gray'),
            TextColumn::make('last_action')->label('Latest')->limit(80)->placeholder('Idle'),
            TextColumn::make('last_active_at')->since()->label('When'),
        ]);
    }
}
