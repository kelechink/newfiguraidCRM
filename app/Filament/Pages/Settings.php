<?php

namespace App\Filament\Pages;

use App\Authz\Access;
use App\Models\AiProvider;
use App\Models\Setting;
use BackedEnum;
use Filament\Notifications\Notification;
use Filament\Pages\Page;

/** Business rules editable without code: FX basis, SLA, margins, approval limit, payroll statutory, AI provider order. */
class Settings extends Page
{
    protected static string|BackedEnum|null $navigationIcon = 'heroicon-o-cog-6-tooth';

    protected static string|\UnitEnum|null $navigationGroup = 'Admin';

    protected static ?int $navigationSort = 0;

    protected string $view = 'filament.pages.settings';

    public array $s = [];

    public array $providers = [];

    public const KEYS = [
        'finance.fx_basis' => ['FX basis for naira conversion', 'select', ['parallel' => 'Parallel market (AI research, daily)', 'official' => 'Official / CBN (manual)']],
        'inbox.sla_minutes' => ['Inbox first-reply SLA (minutes)', 'number'],
        'telecom.margin_alert_pct' => ['Telecom thin-margin alert (%)', 'number'],
        'finance.approval_limit_ngn' => ['Expense approval required above (₦)', 'number'],
        'finance.min_cash_ngn' => ['Minimum cash warning (₦)', 'number'],
        'payroll.pension_pct' => ['Employee pension (%)', 'number'],
        'payroll.nhf_pct' => ['NHF (%)', 'number'],
        'payroll.paye' => ['Deduct PAYE', 'bool'],
        'payroll.employer_pension_pct' => ['Employer pension (%)', 'number'],
        'payroll.nsitf' => ['Pay NSITF (1% of payroll)', 'bool'],
        'payroll.itf' => ['Pay ITF (1% of payroll — 5+ staff or ₦50m turnover)', 'bool'],
        'telecom.statement_tolerance_pct' => ['Vendor statement tolerance before a dispute (%)', 'number'],
        'whiteboard.first_offence_private' => ['First call-out of each kind per month is a private warning (repeats go public)', 'bool'],
        'whiteboard.callouts_enabled' => ['Whiteboard call-outs (#late, #absent…) switched on', 'bool'],
        'agents.max_messages_per_person_per_day' => ['Most messages one person can get from the AI colleagues per day', 'number'],
        'security.require_2fa_all' => ['Require two-factor sign-in for all staff', 'bool'],
        'security.max_record_views_per_hour' => ['Alert when one person opens more records than this per hour', 'number'],
        'security.max_exports_per_day' => ['Alert when one person exports more than this per day', 'number'],
        'security.admin_ip_allowlist' => ['Admin & finance IP allowlist (comma separated, blank = any)', 'list'],
    ];

    public static function canAccess(): bool
    {
        return Access::can(auth()->user(), 'settings', 'edit');
    }

    public function mount(): void
    {
        foreach (self::KEYS as $k => $def) {
            $v = Setting::get($k);
            $this->s[str_replace('.', '__', $k)] = $def[1] === 'list' ? implode(', ', (array) $v) : $v;
        }
        $this->providers = AiProvider::orderBy('priority')->get(['id', 'key', 'name', 'priority', 'is_enabled', 'light_model', 'heavy_model'])->map(fn ($p) => $p->only(['id', 'name', 'priority', 'is_enabled', 'light_model', 'heavy_model']) + ['configured' => \App\Services\AiGateway::configured($p->key)])->all();
    }

    public function save(): void
    {
        foreach (self::KEYS as $k => $def) {
            $v = $this->s[str_replace('.', '__', $k)] ?? null;
            $v = match ($def[1]) { 'number' => (float) $v, 'bool' => (bool) $v, 'list' => array_values(array_filter(array_map('trim', explode(',', (string) $v)))), default => $v };
            if ($k === 'finance.fx_basis' && ! in_array($v, ['parallel', 'official'], true)) {
                continue;
            }
            Setting::put($k, $v);
        }
        foreach ($this->providers as $p) {
            AiProvider::whereKey($p['id'])->update(['priority' => (int) $p['priority'], 'is_enabled' => (bool) $p['is_enabled'], 'light_model' => mb_substr($p['light_model'], 0, 120), 'heavy_model' => mb_substr($p['heavy_model'], 0, 120)]);
        }
        Notification::make()->title('Settings saved')->success()->send();
    }
}
