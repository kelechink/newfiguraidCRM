<?php

namespace App\Filament\Pages;

use App\Authz\Access;
use App\Models\Activity;
use App\Models\Deal;
use App\Models\Pipeline;
use App\Models\PipelineStage;
use App\Services\FxService;
use BackedEnum;
use Filament\Notifications\Notification;
use Filament\Pages\Page;

/** Kanban pipeline: colourful cards, drag between stages, quick view, filters. */
class DealsBoard extends Page
{
    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-view-columns';

    protected static string|\UnitEnum|null $navigationGroup = 'Customers';

    protected static ?int $navigationSort = 2;

    protected static ?string $title = 'Pipeline board';

    protected string $view = 'filament.pages.deals-board';

    public ?string $pipelineId = null;

    public string $search = '';

    public ?string $owner = null;

    public ?string $quick = null;

    public static function canAccess(): bool
    {
        return Access::can(auth()->user(), 'crm.deals');
    }

    public function mount(): void
    {
        $this->pipelineId = $this->pipelines()->first()?->id;
    }

    public function pipelines()
    {
        $u = auth()->user();
        $scope = Access::scope($u, 'crm.deals');

        return Pipeline::query()->when($scope === 'unit', fn ($q) => $q->whereIn('unit_id', $u->unitIds()))->orderBy('position')->get();
    }

    protected function dealsQuery()
    {
        return Access::scopeQuery(Deal::query(), auth()->user(), 'crm.deals', ['owner_id'], 'unit_id')
            ->where('pipeline_id', $this->pipelineId)
            ->when($this->search, fn ($q) => $q->where('title', 'like', '%'.$this->search.'%'))
            ->when($this->owner === 'me', fn ($q) => $q->where('owner_id', auth()->id()))
            ->with(['contact', 'owner']);
    }

    public function moveDeal(string $dealId, string $stageId): void
    {
        $deal = $this->dealsQuery()->findOrFail($dealId);
        abort_unless(Access::allows(auth()->user(), 'crm.deals', 'edit', $deal, ['owner_id'], 'unit_id'), 403);
        $stage = PipelineStage::where('pipeline_id', $deal->pipeline_id)->findOrFail($stageId);
        $from = $deal->stage?->name;
        $deal->forceFill(['stage_id' => $stage->id, 'status' => $stage->kind, 'won_at' => $stage->kind === 'won' ? now() : null, 'lost_at' => $stage->kind === 'lost' ? now() : null])->save();
        Activity::create(['deal_id' => $deal->id, 'contact_id' => $deal->contact_id, 'actor_id' => auth()->id(), 'type' => 'stage', 'summary' => "Moved from $from to {$stage->name}"]);
        $deal->contact?->forceFill(['last_activity_at' => now(), 'lifecycle' => $stage->kind === 'won' ? 'customer' : $deal->contact->lifecycle])->saveQuietly();
        Notification::make()->title("Moved to {$stage->name}")->success()->send();
    }

    protected function getViewData(): array
    {
        $pipeline = Pipeline::with('stages')->find($this->pipelineId);
        $deals = $pipeline ? $this->dealsQuery()->get()->groupBy('stage_id') : collect();

        return [
            'pipeline' => $pipeline, 'pipelines' => $this->pipelines(), 'deals' => $deals,
            'ngn' => fn ($d) => FxService::toNgn((float) $d->value, $d->currency) ?? 0,
            'quickDeal' => $this->quick ? Deal::with(['contact', 'owner', 'stage'])->find($this->quick) : null,
            'activities' => $this->quick ? Activity::where('deal_id', $this->quick)->latest('occurred_at')->limit(8)->get() : collect(),
        ];
    }
}
