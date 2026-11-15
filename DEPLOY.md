# Deploying Figuraid OS to cPanel (same setup as GEA Logistics)

Figuraid OS is a standard Laravel 12 app (PHP 8.2+, MySQL/MariaDB). It needs **no root, no Node, no Redis**:
sessions, cache and the job queue use MySQL, and **one cron line** runs every scheduled job and the queue.

## 1. What the server needs
- PHP **8.2 or 8.3** (cPanel → *MultiPHP Manager* for the domain). Extensions: `pdo_mysql, mbstring, intl, gd, zip, bcmath, fileinfo, openssl, curl, xml`.
  (*Select PHP Version → Extensions* on CloudLinux.)
- MySQL 5.7+/MariaDB 10.4+. Composer (built into most cPanels; otherwise `php composer.phar`).
- SSH/Terminal access is easiest. Without it, use *Git Version Control* + `.cpanel.yml` (already in the repo).

## 2. Database
cPanel → *MySQL Databases*: create database `cpaneluser_figuraid`, user `cpaneluser_fos` with a long password, add the user to the database with **ALL PRIVILEGES**.

## 3. Get the code
cPanel → *Git Version Control* → **Create** → Clone URL `https://github.com/kelechink/newfiguraidCRM.git`
(private repo: use a GitHub deploy key or a fine-grained token), **Repository path** `/home/CPANELUSER/figuraid-os`, branch
`claude/hopeful-galileo-q9uy5u` (or `main` after merging).

Point the domain at Laravel's `public` folder: cPanel → *Domains* → figuraid.com → **Document root** `figuraid-os/public`.
(If the root domain can't be changed, rename `public_html` and symlink: `ln -s ~/figuraid-os/public ~/public_html`.)

## 4. First install (Terminal)
```bash
cd ~/figuraid-os
composer install --no-dev --optimize-autoloader
cp .env.example .env          # then edit .env in File Manager: DB_*, MAIL_*, APP_URL
php artisan key:generate      # writes APP_KEY — back it up somewhere safe (encrypted salaries depend on it)
php artisan migrate --force
php artisan db:seed --class=CoreSeeder --force     # units, roles, Kano House office, policy, pipelines, AI team
php artisan fos:admin you@figuraid.com "Your Name" # first Super Admin (asks for the password)
php artisan storage:link
php artisan optimize && php artisan filament:optimize
chmod -R 775 storage bootstrap/cache
```
Do **not** run `db:seed` without `--class=CoreSeeder` in production: the full seeder adds demo data.

## 5. The one cron job
cPanel → *Cron Jobs* → **Once per minute**:
```
* * * * * cd /home/CPANELUSER/figuraid-os && /usr/local/bin/php artisan schedule:run >> /dev/null 2>&1
```
(Use the PHP path cPanel shows for your version, e.g. `/opt/cpanel/ea-php83/root/usr/bin/php`.)
This runs: the queue worker, inbox SLA escalation (every minute), uptime checks (5 min), Paystack/Flutterwave sync (hourly),
WHMCS sync (6-hourly), bank auto-matching (hourly), playbook tasks (06:00), fraud scan + dunning + renewals + reconciliation
email (07:00), Kene's morning brief (07:45 weekdays), FX research (08:15), customer care (09:05), attendance close (00:30),
deductions (00:45), DB backup (01:30), lead retention (02:00), audit-chain check (Mon 03:00).

## 6. Updating
Push to the branch, then cPanel → *Git Version Control* → *Manage* → **Update from Remote** → **Deploy HEAD Commit**
(runs `.cpanel.yml`: composer, migrate, CoreSeeder, caches). Or in Terminal: `git pull && composer install --no-dev -o && php artisan migrate --force && php artisan optimize`.

## 7. Integrations (fill `.env`, never share keys in chat)
| What | Where to set it up | Webhook / URL to give them |
|---|---|---|
| Paystack (Academy) | Paystack → Settings → API Keys & Webhooks | `https://figuraid.com/webhooks/paystack` |
| Flutterwave (FigureWeb/WHMCS) | Flutterwave → Settings → Webhooks (set a secret hash) | `https://figuraid.com/webhooks/flutterwave` |
| WhatsApp / Instagram / Facebook | Meta developer app → Webhooks (verify token = `META_VERIFY_TOKEN`) | `https://figuraid.com/webhooks/meta` |
| Inbound email | cPanel *Forwarders* → pipe to a script, or a forwarding service, posting JSON signed with `INBOUND_EMAIL_SECRET` | `https://figuraid.com/webhooks/email` |
| WHMCS | WHMCS → API credentials; allow the server IP | read-only sync, no webhook |
| AI (Gemini etc.) | Google AI Studio, Groq, OpenRouter, Mistral, Cerebras — free keys | — |
| Turnstile CAPTCHA | Cloudflare → Turnstile | — |

## 8. After go-live checklist
1. Sign in at `/app`, set up two-factor (required for Super Admin, Admin, Ops, Finance, HR, Auditor).
2. Admin → Settings: confirm FX basis (parallel), SLA 15 min, approval limit, minimum margins (Telecom → Margin rules).
3. Admin → Users: invite staff with status **Onboarding** — they must sign the contract pack before work modules open.
4. Team → Staff records: salaries/bank details (Finance only), office = Kano House, 09:00–17:00.
5. Staff add `https://figuraid.com/clock` to their phone home screen (it installs as an app).
6. Money → Bank accounts; upload the first statement; check the review queue.
7. Off-site backups: cPanel → *Backup* (or JetBackup) daily to remote storage, plus `storage/app/private/backups` (14 days kept).
   Test a restore monthly (PRD §11).
8. Run `php artisan audit:verify` — it should say "Audit chain intact".

## Version 2 additions
- **Email campaigns** send through Brevo when `BREVO_API_KEY` is set, otherwise through your cPanel SMTP. Set up SPF, DKIM and DMARC for figuraid.com first (cPanel → *Email Deliverability*), or campaigns will land in spam.
- **Social posts**: Facebook publishes automatically with `META_PAGE_ID` + `META_PAGE_TOKEN`; Instagram also needs `META_IG_USER_ID` and a public image URL. LinkedIn and X are copy-and-post.
- **Calendars**: each person subscribes to their private feed from *Today → My calendar* (Google: Other calendars → From URL). Bookings email an .ics invitation.
- **CDRs**: *Telecom → CDR uploads*. Large files: split above ~50 MB (shared-hosting upload limits).
- New cron jobs run automatically: campaigns (every minute, 150 emails per run), social publishing (5 min), AI test suite (Mon 05:00), AI quality review (Fri 16:00), scheduled reports (07:30).

## Notes for shared hosting
- Browser push notifications when the app is closed need the PHP `gmp` extension (ask your host) or a push service; until then alerts show in the bell icon and by email.
- Live updates use polling (inbox 15 s, notifications 30 s). Add Pusher keys later for instant updates.
- Virus scanning: shared hosting rarely provides ClamAV to PHP. Uploads are type- and size-restricted and stored privately;
  enable cPanel *Virus Scanner* scheduled scans, or move to a VPS for on-upload scanning.
- `mysqldump` must be allowed for `backup:run`; if not, rely on cPanel backups.
