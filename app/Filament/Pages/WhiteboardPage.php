<?php

namespace App\Filament\Pages;

use App\Authz\Access;
use App\Models\AiAgent;
use App\Models\Task;
use App\Models\User;
use App\Models\WhiteboardPost;
use App\Services\AgentMessenger;
use App\Services\Whiteboard;
use BackedEnum;
use Filament\Notifications\Notification;
use Filament\Pages\Page;

/** Company-wide Whiteboard: hashtag call-outs and kudos everyone can see. */
class WhiteboardPage extends Page
{
    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-presentation-chart-bar';

    protected static string|\UnitEnum|null $navigationGroup = 'Today';

    protected static ?int $navigationSort = 0;

    protected static ?string $slug = 'whiteboard';

    protected static ?string $title = 'Whiteboard';

    protected string $view = 'filament.pages.whiteboard';

    public ?string $tag = null;

    public ?string $person = null;

    public string $kind = 'all';

    // post form (HR / managers)
    public ?string $newUser = null;

    public array $newTags = [];

    public string $newNote = '';

    public string $retractReason = '';

    public string $disputeText = '';

    public static function canAccess(): bool
    {
        return Access::can(auth()->user(), 'dashboard.today');
    }

    public static function canModerate(?User $u = null): bool
    {
        $u ??= auth()->user();

        return $u && ($u->canDo('hr.staff', 'edit') || $u->canDo('attendance.review', 'approve') || $u->isRole('super_admin', 'admin', 'ops_manager'));
    }

    public function postNew(): void
    {
        $this->validate(['newUser' => 'required', 'newTags' => 'required|array|min:1', 'newNote' => 'required|string|max:300']);
        $me = auth()->user();
        $kudosOnly = ! self::canModerate($me);
        $tags = array_values(array_filter($this->newTags, fn ($t) => isset(Whiteboard::TAGS[$t]) && (! $kudosOnly || Whiteboard::TAGS[$t][1] === 'kudos')));
        abort_if(! $tags, 403);
        $p = app(Whiteboard::class)->post(null, User::where('status', 'active')->findOrFail($this->newUser), $tags, $this->newNote, null, null, null, $me);
        Notification::make()->title($p ? 'Posted to the Whiteboard' : 'Not posted (call-outs are switched off)')->{$p ? 'success' : 'warning'}()->send();
        $this->reset(['newUser', 'newTags', 'newNote']);
    }

    public function retract(string $id): void
    {
        abort_unless(self::canModerate(), 403);
        app(Whiteboard::class)->retract(WhiteboardPost::findOrFail($id), auth()->user(), $this->retractReason ?: 'Removed by HR');
        $this->retractReason = '';
    }

    /** The tagged person disputes a call-out: HR gets a task and Amara acknowledges in chat. */
    public function dispute(string $id): void
    {
        $p = WhiteboardPost::where('subject_user_id', auth()->id())->findOrFail($id);
        $this->validate(['disputeText' => 'required|string|min:5|max:1000']);
        $hr = User::where('status', 'active')->whereHas('role', fn ($q) => $q->where('key', 'hr'))->first() ?? AgentMessenger::managerOf(auth()->user());
        Task::create(['title' => 'Whiteboard dispute: '.auth()->user()->name.' '.implode(' ', array_map(fn ($t) => "#$t", $p->hashtags)), 'description' => "Post: {$p->body}\n\nTheir reason: {$this->disputeText}\n\nRemove it from the Whiteboard if they are right.",
            'assignee_id' => $hr?->id, 'origin' => 'system', 'priority' => 'high', 'due_at' => now()->addDay()]);
        if ($agent = AgentMessenger::agent('hr')) {
            AgentMessenger::channel($agent, auth()->user())->messages()->create(['agent_key' => 'hr', 'body' => 'I\'ve sent your dispute to HR. If they agree, the post comes down and any deduction is reversed.']);
        }
        $this->disputeText = '';
        Notification::make()->title('Dispute sent to HR')->success()->send();
    }

    protected function getViewData(): array
    {
        $q = WhiteboardPost::live()->with(['subject', 'author'])
            ->when($this->tag, fn ($w) => $w->where('hashtags', 'like', '%"'.$this->tag.'"%'))
            ->when($this->person, fn ($w) => $w->where('subject_user_id', $this->person))
            ->when($this->kind !== 'all', fn ($w) => $w->where('kind', $this->kind));
        $month = WhiteboardPost::live()->where('created_at', '>=', now()->startOfMonth())->get(['hashtags', 'kind', 'subject_user_id']);

        return [
            'posts' => $q->latest()->limit(100)->get(),
            'tagCounts' => $month->flatMap(fn ($p) => $p->hashtags)->countBy()->sortDesc(),
            'people' => User::where('status', 'active')->orderBy('name')->pluck('name', 'id'),
            'agents' => AiAgent::get()->keyBy('key'),
            'canModerate' => self::canModerate(),
            'tags' => Whiteboard::TAGS,
            'calloutsOn' => Whiteboard::enabled(),
        ];
    }
}
