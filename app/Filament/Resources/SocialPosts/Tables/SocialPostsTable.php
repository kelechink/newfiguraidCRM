<?php

namespace App\Filament\Resources\SocialPosts\Tables;

use App\Services\SocialService;
use Filament\Actions\Action;
use Filament\Actions\EditAction;
use Filament\Notifications\Notification;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class SocialPostsTable
{
    public static function configure(Table $table): Table
    {
        return $table->defaultSort('created_at', 'desc')->columns([
            TextColumn::make('platform')->badge(),
            TextColumn::make('body')->limit(90)->wrap(),
            TextColumn::make('status')->badge()->color(fn ($state) => match ($state) { 'published' => 'success', 'failed' => 'danger', 'approved' => 'info', default => 'warning' }),
            TextColumn::make('agent_key')->label('By')->formatStateUsing(fn ($state) => $state ? 'Zara (AI)' : 'Staff')->placeholder('Staff'),
            TextColumn::make('scheduled_at')->dateTime('j M H:i'),
            TextColumn::make('error')->color('danger')->limit(60)->toggleable(isToggledHiddenByDefault: true),
        ])->recordActions([
            Action::make('approve')->label('Approve')->icon('heroicon-o-check')->color('success')->requiresConfirmation()
                ->visible(fn ($record) => in_array($record->status, ['draft', 'pending_approval', 'failed']) && auth()->user()->canDo('marketing.campaigns', 'approve'))
                ->action(function ($record) {
                    try {
                        app(SocialService::class)->approve($record, auth()->user());
                        Notification::make()->title(in_array($record->platform, ['facebook', 'instagram']) ? 'Approved — it will publish at the scheduled time' : 'Approved — copy it to '.ucfirst($record->platform).' and mark it published')->success()->send();
                    } catch (\RuntimeException $e) {
                        Notification::make()->title($e->getMessage())->danger()->send();
                    }
                }),
            Action::make('published')->label('Mark published')->color('gray')->visible(fn ($record) => $record->status === 'approved' && in_array($record->platform, ['linkedin', 'x']))
                ->action(fn ($record) => $record->forceFill(['status' => 'published', 'published_at' => now()])->save()),
            EditAction::make()->visible(fn ($record) => $record->status !== 'published'),
        ])->headerActions([
            Action::make('zara')->label('Ask Zara for a post')->icon('heroicon-o-sparkles')
                ->schema([
                    \Filament\Forms\Components\Select::make('unit_id')->label('Business')->options(\App\Models\BusinessUnit::pluck('name', 'id'))->required(),
                    \Filament\Forms\Components\Select::make('platform')->options(['facebook' => 'Facebook', 'instagram' => 'Instagram', 'linkedin' => 'LinkedIn', 'x' => 'X'])->required(),
                    \Filament\Forms\Components\Textarea::make('brief')->label('What should it say?')->required(),
                ])
                ->action(function (array $data) {
                    try {
                        app(SocialService::class)->draft($data['unit_id'], $data['platform'], $data['brief']);
                        Notification::make()->title('Zara drafted a post — it waits for approval')->success()->send();
                    } catch (\Throwable $e) {
                        Notification::make()->title('AI unavailable')->body($e->getMessage())->warning()->send();
                    }
                }),
        ]);
    }
}
