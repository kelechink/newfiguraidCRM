<?php

namespace App\Filament\Pages;

use App\Models\AuditLog;
use App\Models\ContractPack;
use App\Models\ContractTemplate;
use BackedEnum;
use Filament\Notifications\Notification;
use Filament\Pages\Page;

/** New staff sign the contract pack and accept the internal privacy policy before work modules open. */
class Onboarding extends Page
{
    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-pencil-square';

    protected static ?string $slug = 'onboarding';

    protected static ?string $title = 'Contract pack & policies';

    protected static string|\UnitEnum|null $navigationGroup = 'Team';

    protected static ?int $navigationSort = 99;

    protected string $view = 'filament.pages.onboarding';

    public string $signature = '';

    public bool $agreeContract = false;

    public bool $agreePrivacy = false;

    public static function canAccess(): bool
    {
        return (bool) auth()->user();
    }

    public static function shouldRegisterNavigation(): bool
    {
        return auth()->user()?->status === 'onboarding';
    }

    public function sign(): void
    {
        $u = auth()->user();
        $this->validate(['signature' => 'required|string|min:3|max:120', 'agreeContract' => 'accepted', 'agreePrivacy' => 'accepted']);
        abort_unless(mb_strtolower(trim($this->signature)) === mb_strtolower(trim($u->name)), 422, 'Type your full name exactly as shown.');
        $templates = ContractTemplate::where('status', 'approved')->where('in_pack', true)->get(['id', 'kind', 'version', 'title']);
        ContractPack::create(['user_id' => $u->id, 'purpose' => 'onboarding', 'status' => 'completed', 'sent_at' => now(), 'completed_at' => now()]);
        $u->forceFill(['contract_signed_at' => now(), 'privacy_policy_version' => config('site.privacy_version'), 'status' => $u->status === 'onboarding' ? 'active' : $u->status])->save();
        AuditLog::record('contract_pack_signed', $u, null, ['signature' => $this->signature, 'documents' => $templates->map(fn ($t) => "$t->kind v$t->version")->all(), 'ip' => request()->ip()]);
        Notification::make()->title('Signed. Welcome to Figuraid.')->success()->send();
        $this->redirect('/app');
    }

    protected function getViewData(): array
    {
        $name = auth()->user()->name;
        $templates = ContractTemplate::where('status', 'approved')->where('in_pack', true)->orderBy('kind')->get()->each(fn ($t) => $t->rendered = strtr($t->body, ['{'.'{name}}' => $name, '{'.'{date}}' => now()->format('j F Y')]));

        return ['templates' => $templates, 'signed' => auth()->user()->contract_signed_at];
    }
}
