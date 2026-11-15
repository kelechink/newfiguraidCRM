<?php

namespace App\Filament\Resources\Conversations\Pages;

use App\Filament\Resources\Conversations\ConversationResource;
use App\Models\Message;
use App\Models\Task;
use App\Services\ChannelSender;
use App\Services\InboxRouter;
use Filament\Actions\Action;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\EditRecord;

class EditConversation extends EditRecord
{
    protected static string $resource = ConversationResource::class;

    protected string $view = 'filament.conversation';

    protected function getHeaderActions(): array
    {
        $c = $this->record;

        return [
            Action::make('reply')->label('Reply')->icon('heroicon-o-paper-airplane')->modalWidth('2xl')
                ->fillForm(fn () => ['body' => Message::where('conversation_id', $c->id)->where('delivery', 'draft')->latest()->value('body')])
                ->schema([Textarea::make('body')->label('Message to customer')->rows(6)->required()->maxLength(4000)->helperText('Drafted by Ada when available. Prices, discounts, refunds and contracts must be confirmed by a person.')])
                ->action(function (array $data) use ($c) {
                    Message::where('conversation_id', $c->id)->where('delivery', 'draft')->delete();
                    $m = app(ChannelSender::class)->send($c, $data['body'], auth()->id());
                    Notification::make()->title($m->delivery === 'failed' ? 'Saved, but sending failed — check the channel settings' : 'Sent')->{$m->delivery === 'failed' ? 'warning' : 'success'}()->send();
                }),
            Action::make('resolve')->label('Resolve')->icon('heroicon-o-check')->color('success')->visible($c->status !== 'resolved')
                ->schema([Textarea::make('resolution_note')->label('Resolution note')->helperText('Required when no reply was sent. No conversation closes without a reply or a note.')])
                ->action(function (array $data) use ($c) {
                    $c->resolution_note = $data['resolution_note'] ?: $c->resolution_note;
                    if (! InboxRouter::canResolve($c)) {
                        Notification::make()->title('Reply to the customer or add a resolution note first.')->danger()->send();

                        return;
                    }
                    $c->forceFill(['status' => 'resolved', 'resolved_at' => now()])->save();
                    \App\Models\Survey::create(['kind' => 'csat', 'contact_id' => $c->contact_id, 'unit_id' => $c->unit_id, 'token' => \Illuminate\Support\Str::random(40)]);
                    Notification::make()->title('Resolved')->success()->send();
                }),
            Action::make('reassign')->label('Reassign')->icon('heroicon-o-arrows-right-left')->color('gray')
                ->schema([Select::make('assignee_id')->label('Assign to')->options(fn () => InboxRouter::available($c->unit_id)->pluck('name', 'id'))->helperText('Only staff clocked in today and not on leave.')->required()])
                ->action(fn (array $data) => $c->forceFill(['assignee_id' => $data['assignee_id'], 'sla_due_at' => now()->addMinutes(InboxRouter::slaMinutes())])->save()),
            Action::make('task')->label('Create task')->icon('heroicon-o-plus-circle')->color('gray')
                ->schema([Textarea::make('title')->required()->rows(2)])
                ->action(fn (array $data) => Task::create(['title' => $data['title'], 'unit_id' => $c->unit_id, 'conversation_id' => $c->id, 'contact_id' => $c->contact_id, 'assignee_id' => auth()->id(), 'creator_id' => auth()->id(), 'origin' => 'team_lead', 'due_at' => now()->addDay()])),
        ];
    }
}
