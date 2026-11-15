<?php

use App\Models\AuditLog;
use App\Models\User;
use App\Services\Agents;
use App\Services\AttendanceService;
use App\Services\BankMatcher;
use App\Services\FxService;
use App\Services\InboxRouter;
use App\Services\Ops;
use App\Services\Payments;
use App\Services\Retention;
use App\Services\Whmcs;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schedule;

/*
| One cPanel cron entry runs everything:  * * * * *  cd ~/figuraid-os && php artisan schedule:run >> /dev/null 2>&1
| Times are Africa/Lagos.
*/

Artisan::command('fx:update', function () {
    try {
        $this->table(['Currency', 'Rate', 'Accepted', 'Reason'], collect(app(FxService::class)->research())->map(fn ($v, $k) => [$k, $v['rate'], $v['accepted'] ? 'yes' : 'NO', $v['reason']])->all());
    } catch (\Throwable $e) {
        Ops::notifyRoles(['finance'], 'FX rates not updated', 'Automatic rate research failed today ('.mb_substr($e->getMessage(), 0, 120).'). Enter today\'s rates in Money → Exchange rates.', '/app/fx-rates');
        $this->error($e->getMessage());
    }
})->purpose('Research today\'s parallel-market naira rates (AI web search, two-source rule)');
Artisan::command('inbox:escalate', fn () => $this->info(app(InboxRouter::class)->escalate().' escalated'))->purpose('SLA reminders, reassignment and escalation');
Artisan::command('attendance:close', fn () => $this->info(app(Ops::class)->closeAttendance().' staff days closed'))->purpose('Recompute yesterday (absences, no-shows)');
Artisan::command('attendance:deductions {month?}', function ($month = null) {
    $month ??= now()->format('Y-m');
    User::where('status', 'active')->whereHas('staffProfile')->each(fn ($u) => app(AttendanceService::class)->deductionsForMonth($u, $month));
    $this->info("Deductions rebuilt for $month");
})->purpose('Rebuild attendance deductions for a month');
Artisan::command('leads:retention', fn () => $this->info(json_encode(app(Retention::class)->run())))->purpose('Delete leads with no follow-up for 90 days (warns at 83)');
Artisan::command('playbooks:generate', fn () => $this->info(app(Ops::class)->generatePlaybookTasks().' tasks created'))->purpose('Create today\'s playbook tasks');
Artisan::command('brief:morning', function () {
    $text = app(Agents::class)->morningBrief(Ops::briefFacts());
    Ops::notifyRoles(['super_admin', 'admin', 'ops_manager'], 'Morning brief from Kene', mb_substr($text, 0, 900), '/app', true);
})->purpose('Kene\'s morning brief');
Artisan::command('care:run', fn () => $this->info(json_encode(app(Agents::class)->customerCare())))->purpose('Renewal reminders 30/14/7/1, birthdays');
Artisan::command('payments:sync', fn () => $this->info('Paystack '.app(Payments::class)->syncPaystack().', Flutterwave '.app(Payments::class)->syncFlutterwave()))->purpose('Pull confirmed gateway payments');
Artisan::command('whmcs:sync', fn () => Whmcs::configured() ? $this->info(json_encode(app(Whmcs::class)->sync())) : $this->warn('WHMCS not configured'))->purpose('Sync FigureWeb WHMCS');
Artisan::command('bank:match', fn () => $this->info(json_encode(app(BankMatcher::class)->matchAll())))->purpose('Auto-match bank credits to open invoices');
Artisan::command('ops:daily', function () {
    $o = app(Ops::class);
    $this->info('fraud '.$o->fraudScan().', dunning '.$o->dunning().', renewals '.$o->renewals());
    $o->reconciliationReport();
})->purpose('Fraud scan, dunning, renewals, reconciliation report');
Artisan::command('reports:send', fn () => $this->info(app(\App\Services\ReportService::class)->sendDue().' report(s) sent'))->purpose('Email scheduled reports');
Artisan::command('campaigns:send', fn () => $this->info(app(\App\Services\CampaignService::class)->sendBatch().' emails sent'))->purpose('Send the next batch of approved campaigns');
Artisan::command('social:publish', fn () => $this->info(app(\App\Services\SocialService::class)->publishDue().' posts published'))->purpose('Publish approved, due social posts');
Artisan::command('ai:test', function () {
    $agents = app(\App\Services\Agents::class);
    $pass = $fail = 0;
    foreach (\App\Models\AgentTestCase::all() as $t) {
        try {
            [$reply] = $agents->websiteReply('', $t->question);
        } catch (\Throwable) {
            $reply = '';
        }
        $low = mb_strtolower($reply);
        $ok = $reply !== '' && collect(preg_split('/\s*,\s*/', (string) $t->must_include, -1, PREG_SPLIT_NO_EMPTY))->every(fn ($w) => str_contains($low, mb_strtolower($w)))
            && collect(preg_split('/\s*,\s*/', (string) $t->must_not_include, -1, PREG_SPLIT_NO_EMPTY))->every(fn ($w) => ! str_contains($low, mb_strtolower($w)));
        $t->forceFill(['last_passed' => $ok, 'last_run_at' => now()])->save();
        $ok ? $pass++ : $fail++;
    }
    $this->info("$pass passed, $fail failed");
    if ($fail) {
        Ops::notifyRoles(['super_admin', 'ops_manager'], 'AI test suite', "$fail agent test(s) failed — check the knowledge base.", '/app/agent-test-cases');
    }
})->purpose('Run the agent test suite (real questions with expected / forbidden content)');
Artisan::command('ai:review', function () {
    $ai = app(\App\Services\AiGateway::class);
    $done = 0;
    foreach (\App\Models\AiAction::whereNull('quality_score')->whereIn('kind', ['reply', 'classify', 'campaign', 'renewal'])->where('created_at', '>=', now()->subWeek())->inRandomOrder()->limit(25)->get() as $a) {
        try {
            $r = $ai->complete('You review an AI customer-service assistant for Figuraid. Score 1-5 for accuracy, tone and safety (never quotes prices, never promises refunds or discounts). Reply ONLY JSON {"score":n,"issue":"short note or empty"}.', "Input:\n".mb_substr((string) $a->input_summary, 0, 1500)."\n\nOutput:\n".mb_substr((string) $a->output, 0, 2000));
            $j = \App\Domain\Money::extractJson($r['text']) ?? [];
            if (isset($j['score'])) {
                $a->forceFill(['quality_score' => max(1, min(5, (int) $j['score']))])->save();
                $done++;
            }
        } catch (\Throwable) {
            break;
        }
    }
    $avg = \App\Models\AiAction::where('created_at', '>=', now()->subWeek())->whereNotNull('quality_score')->avg('quality_score');
    Ops::notifyRoles(['super_admin', 'ops_manager'], 'Weekly AI quality review', "$done replies reviewed. Average score this week: ".($avg ? round($avg, 1) : '—').'/5. Low scores are listed under AI activity.', '/app/ai-actions', true);
})->purpose('Weekly AI quality review (scores a sample of agent replies)');
Artisan::command('agents:run {slot}', function (string $slot) {
    $hr = app(\App\Services\StaffAgents\HrAgent::class);
    $acct = app(\App\Services\StaffAgents\AccountantAgent::class);
    $gm = app(\App\Services\StaffAgents\GeneralManagerAgent::class);
    $n = match ($slot) {
        'morning' => $hr->morning() + $gm->morning(),
        'daily' => $hr->daily() + $acct->daily() + $acct->monthEnd(),
        'evening' => $hr->evening(),
        'weekly-finance' => $acct->weekly(),
        'weekly-gm' => $gm->weekly(),
        'points' => $hr->monthlyPoints(),
        'followups' => app(\App\Services\AgentMessenger::class)->followUps(),
        default => 0,
    };
    $this->info("$slot: $n message(s)");
})->purpose('Run the HR, Accountant and General Manager agents (slot: morning|daily|evening|weekly-finance|weekly-gm|points|followups)');
Artisan::command('uptime:check', fn () => $this->info(app(Ops::class)->uptime().' down'))->purpose('Check websites');
Artisan::command('audit:verify', function () {
    $prev = str_repeat('0', 64);
    $bad = 0;
    DB::table('audit_logs')->orderBy('id')->chunk(2000, function ($rows) use (&$prev, &$bad) {
        foreach ($rows as $r) {
            $row = (array) $r;
            $row['at'] = substr($row['at'], 0, 26);
            if ($row['prev_hash'] !== $prev || AuditLog::hashOf($row) !== $row['hash']) {
                $bad++;
                $this->error("Chain broken at #{$row['id']}");
            }
            $prev = $row['hash'];
        }
    });
    $bad ? $this->error("$bad problem(s)") : $this->info('Audit chain intact');

    return $bad ? 1 : 0;
})->purpose('Verify the audit hash chain');
Artisan::command('backup:run', function () {
    $dir = storage_path('app/private/backups');
    @mkdir($dir, 0700, true);
    $file = $dir.'/db-'.now()->format('Ymd-His').'.sql.gz';
    $c = config('database.connections.mysql');
    $cmd = sprintf('mysqldump --single-transaction --no-tablespaces -h%s -P%s -u%s %s | gzip > %s', escapeshellarg($c['host']), escapeshellarg((string) $c['port']), escapeshellarg($c['username']), escapeshellarg($c['database']), escapeshellarg($file));
    $ok = 0;
    exec('MYSQL_PWD='.escapeshellarg((string) $c['password']).' '.$cmd, $out, $ok);
    foreach (glob("$dir/db-*.sql.gz") as $old) {
        if (filemtime($old) < now()->subDays(14)->timestamp) {
            unlink($old);
        }
    }
    $ok === 0 ? $this->info("Backup written: $file") : $this->error('Backup failed');
})->purpose('Database backup to private storage (copy off-site with cPanel backup or rclone)');

// Queue worker for shared hosting: drains the database queue each minute.
Schedule::command('queue:work --stop-when-empty --max-time=55 --tries=3')->everyMinute()->withoutOverlapping()->runInBackground();
Schedule::command('inbox:escalate')->everyMinute()->withoutOverlapping();
Schedule::command('uptime:check')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('payments:sync')->hourly()->withoutOverlapping();
Schedule::command('whmcs:sync')->everySixHours()->withoutOverlapping();
Schedule::command('bank:match')->hourly();
Schedule::command('playbooks:generate')->dailyAt('06:00');
Schedule::command('attendance:close')->dailyAt('00:30');
Schedule::command('attendance:deductions')->dailyAt('00:45');
Schedule::command('fx:update')->dailyAt('08:15');
Schedule::command('brief:morning')->weekdays()->at('07:45');
Schedule::command('care:run')->dailyAt('09:05');
Schedule::command('ops:daily')->dailyAt('07:00');
Schedule::command('leads:retention')->dailyAt('02:00');
Schedule::command('backup:run')->dailyAt('01:30');
Schedule::command('reports:send')->dailyAt('07:30');
Schedule::command('campaigns:send')->everyMinute()->withoutOverlapping();
Schedule::command('social:publish')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('ai:test')->weeklyOn(1, '05:00');
Schedule::command('ai:review')->weeklyOn(5, '16:00');
Schedule::command('agents:run morning')->weekdays()->at('09:20');
Schedule::command('agents:run daily')->dailyAt('10:00');
Schedule::command('agents:run evening')->weekdays()->at('17:15');
Schedule::command('agents:run followups')->hourly()->between('9:00', '17:30')->weekdays();
Schedule::command('agents:run weekly-finance')->weeklyOn(1, '08:30');
Schedule::command('agents:run weekly-gm')->weeklyOn(5, '16:30');
Schedule::command('agents:run points')->monthlyOn(1, '09:00');
Schedule::command('audit:verify')->weeklyOn(1, '03:00');

Artisan::command('fos:admin {email} {name}', function (string $email, string $name) {
    $password = $this->secret('Password (min 10 characters, letters and numbers)');
    $v = \Illuminate\Support\Facades\Validator::make(['password' => $password], ['password' => ['required', \Illuminate\Validation\Rules\Password::defaults()]]);
    if ($v->fails()) {
        return $this->error($v->errors()->first());
    }
    $u = User::updateOrCreate(['email' => strtolower($email)], ['name' => $name, 'password' => $password, 'status' => 'active', 'role_id' => \App\Models\Role::where('key', 'super_admin')->value('id'), 'primary_unit_id' => \App\Models\BusinessUnit::where('code', 'TELECOM')->value('id')]);
    $u->forceFill(['email_verified_at' => now(), 'contract_signed_at' => now()])->save();
    $this->info("Super Admin ready: {$u->email}. Sign in at /app — you will be asked to set up two-factor authentication.");
})->purpose('Create or reset the first Super Admin');
