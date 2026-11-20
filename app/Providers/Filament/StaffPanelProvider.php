<?php

namespace App\Providers\Filament;

use App\Http\Middleware\EnforceIpAllowlist;
use App\Http\Middleware\RequireContractSigned;
use Filament\Auth\MultiFactor\App\AppAuthentication;
use Filament\Http\Middleware\Authenticate;
use Filament\Http\Middleware\AuthenticateSession;
use Filament\Http\Middleware\DisableBladeIconComponents;
use Filament\Http\Middleware\DispatchServingFilamentEvent;
use Filament\Navigation\NavigationGroup;
use Filament\Panel;
use Filament\PanelProvider;
use Filament\Support\Colors\Color;
use Filament\Support\Enums\Width;
use Filament\View\PanelsRenderHook;
use Illuminate\Contracts\View\View;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\VerifyCsrfToken;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\View\Middleware\ShareErrorsFromSession;

class StaffPanelProvider extends PanelProvider
{
    public function panel(Panel $panel): Panel
    {
        return $panel
            ->default()
            ->id('app')
            ->path('app')
            ->brandName('Figuraid OS')
            ->brandLogo(asset('brand/logo-horizontal.svg'))
            ->darkModeBrandLogo(asset('brand/logo-horizontal-dark.svg'))
            ->brandLogoHeight('2.25rem')
            ->favicon(asset('brand/icon-32.png'))
            ->login(\App\Filament\Auth\Login::class)
            ->passwordReset()
            ->profile(isSimple: false)
            ->multiFactorAuthentication([AppAuthentication::make()->recoverable()])
            ->requiresMultiFactorAuthentication(fn ($user) => $user?->requiresTwoFactor() ?? false)
            ->colors(['primary' => [50 => 'oklch(0.97 0.014 257)', 100 => 'oklch(0.94 0.03 257)', 200 => 'oklch(0.88 0.06 257)', 300 => 'oklch(0.80 0.10 257)', 400 => 'oklch(0.70 0.15 257)', 500 => 'oklch(0.60 0.17 257)', 600 => 'oklch(0.505 0.17 257)', 700 => 'oklch(0.44 0.15 257)', 800 => 'oklch(0.38 0.12 257)', 900 => 'oklch(0.32 0.10 257)', 950 => 'oklch(0.24 0.07 257)'] /* Figuraid brand blue #075bbc at 600 */, 'gray' => Color::Slate])
            ->font('Inter')
            // Brand theme (plain CSS, no build step) and the always-visible clock button.
            ->renderHook(PanelsRenderHook::STYLES_AFTER, fn (): string => '<link rel="stylesheet" href="'.asset('css/figuraid/panel.css').'?v='.@filemtime(public_path('css/figuraid/panel.css')).'">')
            ->renderHook(PanelsRenderHook::GLOBAL_SEARCH_BEFORE, fn (): View => view('filament.hooks.clock-pill'))
            ->renderHook(PanelsRenderHook::SIMPLE_LAYOUT_END, fn (): View => view('filament.hooks.login-tagline'), scopes: \App\Filament\Auth\Login::class)
            ->renderHook(PanelsRenderHook::AUTH_LOGIN_FORM_AFTER, fn (): string => '<p class="fos-login-note">Clock in / Clock out sign you in and open the clock page (selfie and location at Kano House).</p>')
            ->darkMode(true)
            ->spa()
            ->sidebarCollapsibleOnDesktop()
            ->maxContentWidth(Width::Full)
            ->globalSearchKeyBindings(['command+k', 'ctrl+k'])
            ->databaseNotifications()
            ->databaseNotificationsPolling('30s')
            ->unsavedChangesAlerts()
            ->navigationGroups(array_map(fn ($g) => NavigationGroup::make($g), ['Today', 'Customers', 'Telecom', 'FigureWeb', 'Academy', 'Procurement', 'Money', 'Team', 'AI team', 'Admin']))
            ->discoverResources(in: app_path('Filament/Resources'), for: 'App\Filament\Resources')
            ->discoverPages(in: app_path('Filament/Pages'), for: 'App\Filament\Pages')
            ->pages([\Filament\Pages\Dashboard::class])
            ->discoverWidgets(in: app_path('Filament/Widgets'), for: 'App\Filament\Widgets')
            ->middleware([
                EncryptCookies::class,
                AddQueuedCookiesToResponse::class,
                StartSession::class,
                AuthenticateSession::class,
                ShareErrorsFromSession::class,
                VerifyCsrfToken::class,
                SubstituteBindings::class,
                DisableBladeIconComponents::class,
                DispatchServingFilamentEvent::class,
            ])
            ->authMiddleware([Authenticate::class, EnforceIpAllowlist::class, RequireContractSigned::class, \App\Http\Middleware\WatchBulkViewing::class]);
    }
}
