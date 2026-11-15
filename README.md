# Figuraid OS

One Laravel platform for Figuraid: the public website (figuraid.com) and the company operating system for
Telecom, FigureWeb, Figure Academy and Procurement — built for cPanel shared hosting, like GEA Logistics.

- **Stack:** Laravel 12 · Filament 5 (staff panel at `/app`) · Livewire · MySQL · database queue · one cron.
- **Website:** `/` (Blade, scroll-scrubbed globe, services, coverage map, industries, request form, AI assistant Ada), `/request`, `/terms`, `/privacy`.
- **Staff:** `/app` (Cmd/Ctrl+K search, dark mode), phone clock-in at `/clock`.
- **Public utility pages:** `/verify/{code}` (certificates), `/q/{token}` (quotes & invoices, e-signature), `/s/{token}` (CSAT/NPS), `/book/{user}`.

Deploy: see **[DEPLOY.md](DEPLOY.md)**. Local: `composer install && cp .env.example .env && php artisan key:generate && php artisan migrate --seed && php artisan serve`
(demo users `founder@figuraid.test`, `finance@figuraid.test`, `staff@figuraid.test`… password from `DEMO_PASSWORD` or `Figuraid-demo-2026`).
Tests: `php artisan test` (needs a MySQL database named in `phpunit.xml`).

Where things live: business rules in `app/Domain` (attendance, payroll, telecom, money — plain code, never AI),
services in `app/Services`, permissions in `app/Authz`, screens in `app/Filament`, website copy in `config/site.php`.
