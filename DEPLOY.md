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

## figuraid.com as installed (Nov 2026)
- App folder: `~/public_html/figuraid-os` (`~/figuraid-os` links to it). The host only serves files inside `public_html`,
  so `public_html/.htaccess` rewrites figuraid.com/www to `figuraid-os/public/` and returns 403 for anything else under `/figuraid-os/`.
- PHP: CloudLinux *Select PHP Version* 8.3 with `intl`, `fileinfo`, `sodium`, `opcache` and `nd_pdo_mysql` (not `pdo_mysql`, they conflict).
  CLI and cron use `/usr/local/bin/php`. Composer is `~/composer.phar`.
- Cron: `cd /home/figuraid/public_html/figuraid-os && /usr/local/bin/php artisan schedule:run`.
- `os.figuraid.com` points at the same app (handy for checks). The old static site is in `~/old-site-backup-20261119`.

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

## AI colleagues: HR (Amara), Financial Accountant (Tobi), General Manager (Obinna)
- The agents have no email accounts. They work only inside Figuraid OS: direct messages in Team chat, the bell, #General
  and the Whiteboard, where they tag staff with hashtags (#late, #absent, #overdue…). Staff answer them in Team chat.
- Rename agents, change their briefs or pause them in *AI team → AI agents*. Message limit per person per day: *Admin → Settings*.
- Schedule: HR nudge 09:20, daily checks 10:00, end-of-day reminders 17:15, follow-ups hourly, finance note Monday 08:30,
  GM weekly review Friday 16:30, staff points on the 1st.

## Mailboxes (rates@, noc@, sales@, billing@, info@)
The system signs in to each mailbox itself (IMAP) — no forwarders or pipes needed:
1. cPanel → *Email Accounts*: make sure each address exists. Add **rate@figuraid.com** as a *Forwarder* to rates@ so both spellings work.
2. Put each mailbox password in `.env` (`MAILBOX_RATES_PASSWORD`, `MAILBOX_NOC_PASSWORD`, …). `MAILBOX_HOST` is usually `mail.figuraid.com`, port 993, SSL.
3. Admin → *Mailboxes* shows each one's status; press **Check now** to test.
4. rates@ is read hourly; the others every 5 minutes. Mail is only marked read — never deleted — so people can still open the
   mailboxes in webmail or Outlook as before.
5. Replies, invoices, broadcasts and campaigns go out **from** the matching address (billing@, rates@, sales@). If your cPanel SMTP refuses
   to send "as" another address, log in SMTP as info@ and allow sending for the domain, or give each mailbox its own SMTP login.
6. Vendors: tell every vendor to send rate sheets (CSV or Excel .xlsx) to rates@. Old Excel .xls files can't be read automatically —
   they go to the inbox for a person. Verified, active vendors' rates go live straight away; new senders become vendor leads with a draft deck.

## WhatsApp templates
Customers who last wrote more than 24 hours ago can only be messaged with templates Meta has approved. Create templates with the
same names as *Admin → WhatsApp templates* (follow_up, invoice_reminder, renewal_reminder, class_reminder) in Meta Business Manager;
the inbox shows **Send WhatsApp template** automatically when the window has closed.

## Carrier billing
New carriers default to **prepaid**. Set each carrier's cycle (7/3, 7/4…), first cycle date and low-balance threshold under Telecom → Carriers.
Every night the system charges yesterday's usage to prepaid balances, invoices finished cycles for postpaid carriers, and opens vendor
cycles; Finance enters each vendor's statement in Telecom → Billing cycles and differences above 1% open a dispute.

## Security setup (do these before go-live)
1. **Cloudflare (free)**: add figuraid.com to Cloudflare, switch nameservers, set SSL to *Full (strict)*, turn on *Always use HTTPS*,
   *Bot Fight Mode* and the managed WAF rules. Turnstile keys for the forms come from the same dashboard.
2. **Two-factor for everyone** is on by default (Admin → Settings). Each person scans a QR code with Google Authenticator at first sign-in;
   keep the recovery codes. Have **two** Super Admins.
3. **Back up `APP_KEY`** (in the server `.env`) offline, e.g. printed in a safe. Without it, encrypted salaries and bank details are lost.
4. **Off-site backups**: cPanel/JetBackup daily to remote storage + `storage/app/private/backups`. **Restore test monthly** into a
   staging copy (a subdomain like `staging.figuraid.com` with its own database and `APP_ENV=staging`) — also use staging to try updates first.
5. **GitHub Actions** runs all tests and `composer audit` (known-vulnerable packages) on every push — keep it green before deploying.
6. **Penetration test** by an outside firm before salaries and bank details are entered; fix findings, retest.
7. Read `docs/INCIDENT_RESPONSE.md` with your leadership team (NDPA: 72-hour breach notice).
8. Create the `security@figuraid.com` mailbox (listed in `/.well-known/security.txt`).

## Notes for shared hosting
- Browser push notifications when the app is closed need the PHP `gmp` extension (ask your host) or a push service; until then alerts show in the bell icon and by email.
- Live updates use polling (inbox 15 s, notifications 30 s). Add Pusher keys later for instant updates.
- Virus scanning: shared hosting rarely provides ClamAV to PHP. Uploads are type- and size-restricted and stored privately;
  enable cPanel *Virus Scanner* scheduled scans, or move to a VPS for on-upload scanning.
- `mysqldump` must be allowed for `backup:run`; if not, rely on cPanel backups.
