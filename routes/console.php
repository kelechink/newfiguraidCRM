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
