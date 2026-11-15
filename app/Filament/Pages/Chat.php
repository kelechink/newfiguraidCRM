<?php

namespace App\Filament\Pages;

use App\Authz\Access;
use App\Models\AiAgent;
use App\Models\ChatChannel;
use App\Models\ChatMessage;
use App\Models\Task;
use App\Models\User;
use App\Notifications\Alert;
use BackedEnum;
use Filament\Notifications\Notification;
use Filament\Pages\Page;

/** Internal chat: channels, direct messages, AI agents post handovers here, any message → task. */
class Chat extends Page
{
    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-chat-bubble-left-right';

    protected static string|\UnitEnum|null $navigationGroup = 'Today';

    protected static ?int $navigationSort = 1;

    protected static ?string $title = 'Team chat';

    protected string $view = 'filament.pages.chat';

    public ?string $channelId = null;

    public string $body = '';

    public ?string $dmUser = null;

    public static function canAccess(): bool
    {
        return Access::can(auth()->user(), 'messaging');
    }

    public function mount(): void
    {
        $general = ChatChannel::firstOrCreate(['kind' => 'general', 'name' => 'General']);
        $general->members()->syncWithoutDetaching([auth()->id()]);
        $this->channelId = $this->channels()->first()?->id;
    }

    public function channels()
    {
        return ChatChannel::whereHas('members', fn ($q) => $q->where('users.id', auth()->id()))->orderByRaw("kind = 'general' desc")->orderBy('name')->get();
    }

    private function channel(): ChatChannel
    {
        return ChatChannel::whereHas('members', fn ($q) => $q->where('users.id', auth()->id()))->findOrFail($this->channelId);
    }

    public function send(): void
    {
        $this->validate(['body' => 'required|string|max:4000']);
        $c = $this->channel();
        preg_match_all('/@([A-Za-z]+)/', $this->body, $m);
        $mentioned = User::where('status', 'active')->whereIn(\DB::raw('substring_index(name, " ", 1)'), $m[1] ?? [])->get();
        $c->messages()->create(['author_id' => auth()->id(), 'body' => $this->body, 'mentions' => $mentioned->pluck('id')->all()]);
        $mentioned->each(fn ($u) => $u->notify(new Alert(auth()->user()->name.' mentioned you', mb_substr($this->body, 0, 140), '/app/chat')));
        $c->members()->updateExistingPivot(auth()->id(), ['last_read_at' => now()]);
        $this->body = '';
    }

    public function toTask(string $messageId): void
    {
        $msg = ChatMessage::where('chat_channel_id', $this->channel()->id)->findOrFail($messageId);
        $t = Task::create(['title' => mb_substr(strip_tags($msg->body), 0, 200), 'description' => $msg->body, 'assignee_id' => auth()->id(), 'creator_id' => auth()->id(), 'origin' => 'team_lead', 'chat_message_id' => $msg->id, 'due_at' => now()->addDay()]);
        Notification::make()->title('Task created')->success()->send();
    }

    public function openDm(): void
    {
        $other = User::where('status', 'active')->findOrFail($this->dmUser);
        $key = collect([auth()->id(), $other->id])->sort()->implode(':');
        $c = ChatChannel::firstOrCreate(['direct_key' => $key], ['kind' => 'direct', 'name' => null, 'created_by_id' => auth()->id()]);
        $c->members()->syncWithoutDetaching([auth()->id(), $other->id]);
        $this->channelId = $c->id;
        $this->dmUser = null;
    }

    protected function getViewData(): array
    {
        $c = $this->channelId ? $this->channel() : null;
        $c?->members()->updateExistingPivot(auth()->id(), ['last_read_at' => now()]);

        return [
            'channels' => $this->channels()->load('members'),
            'current' => $c,
            'messages' => $c ? $c->messages()->with('author')->latest()->limit(100)->get()->reverse() : collect(),
            'agents' => AiAgent::pluck('name', 'key'),
            'colors' => AiAgent::pluck('color', 'key'),
            'people' => User::where('status', 'active')->where('id', '!=', auth()->id())->orderBy('name')->pluck('name', 'id'),
        ];
    }
}
