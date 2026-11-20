<?php

namespace App\Filament\Auth;

use Filament\Actions\Action;
use Filament\Auth\Http\Responses\Contracts\LoginResponse;
use Filament\Auth\Pages\Login as BaseLogin;
use Filament\Schemas\Components\Actions;
use Filament\Schemas\Components\Component;
use Filament\Schemas\Components\EmbeddedSchema;
use Filament\Schemas\Components\Form;
use Filament\Support\Components\Attributes\Exposed;
use Filament\Support\Components\Attributes\Unexposed;
use Illuminate\Contracts\Support\Htmlable;

/**
 * Staff sign-in with three clear buttons: "Log in here" (opens the dashboard),
 * "Clock in here" and "Clock out here" (sign in, then go straight to the phone clock page).
 */
class Login extends BaseLogin
{
    public function getHeading(): string|Htmlable|null
    {
        return filled($this->userUndertakingMultiFactorAuthentication) ? parent::getHeading() : 'Welcome back';
    }

    #[Unexposed]
    public function getSubheading(): string|Htmlable|null
    {
        return filled($this->userUndertakingMultiFactorAuthentication)
            ? parent::getSubheading()
            : 'Sign in to Figuraid OS, or clock in and out for the day.';
    }

    protected function getFormActions(): array
    {
        return [
            $this->getAuthenticateFormAction(),
            Action::make('clockIn')
                ->label('Clock in here')
                ->icon('heroicon-m-finger-print')
                ->color('success')
                ->action(fn () => $this->loginToClock()),
            Action::make('clockOut')
                ->label('Clock out here')
                ->icon('heroicon-m-arrow-right-start-on-rectangle')
                ->color('warning')
                ->action(fn () => $this->loginToClock()),
        ];
    }

    protected function getAuthenticateFormAction(): Action
    {
        return parent::getAuthenticateFormAction()
            ->label('Log in here')
            ->icon('heroicon-m-arrow-right-end-on-rectangle')
            ->iconPosition('after');
    }

    /** Sign in, then land on /clock (also after the two-factor step, via the intended URL). */
    #[Exposed]
    public function loginToClock(): ?LoginResponse
    {
        session()->put('url.intended', url('/clock'));

        $response = $this->authenticate();

        if ($response) {
            $this->redirect(url('/clock'));
        }

        return null;
    }

    #[Unexposed]
    public function getFormContentComponent(): Component
    {
        return Form::make([EmbeddedSchema::make('form')])
            ->id('form')
            ->livewireSubmitHandler('authenticate')
            ->footer([
                Actions::make($this->getFormActions())
                    ->fullWidth()
                    ->extraAttributes(['class' => 'fos-login-actions'])
                    ->key('form-actions'),
            ])
            ->visible(fn (): bool => blank($this->userUndertakingMultiFactorAuthentication));
    }
}
