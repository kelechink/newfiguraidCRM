<?php

use App\Http\Controllers\ClockController;
use App\Http\Controllers\PublicController;
use App\Http\Controllers\SiteController;
use App\Http\Controllers\WebhookController;
use Illuminate\Support\Facades\Route;

// Public website (figuraid.com)
Route::get('/', [SiteController::class, 'home'])->name('home');
Route::get('/request', [SiteController::class, 'request'])->name('request');
Route::post('/request', [SiteController::class, 'submit'])->middleware('throttle:public-forms')->name('request.submit');
Route::post('/chat', [SiteController::class, 'chat'])->middleware('throttle:chat')->name('chat');
Route::get('/terms', [SiteController::class, 'legal'])->defaults('doc', 'terms')->name('terms');
Route::get('/privacy', [SiteController::class, 'legal'])->defaults('doc', 'privacy')->name('privacy');
Route::get('/sitemap.xml', [SiteController::class, 'sitemap']);

// Public utility pages
Route::get('/verify/{code}', [PublicController::class, 'certificate'])->name('certificate.verify');
Route::get('/q/{token}', [PublicController::class, 'quote'])->name('quote.show');
Route::post('/q/{token}', [PublicController::class, 'signQuote'])->middleware('throttle:public-forms')->name('quote.sign');
Route::get('/s/{token}', [PublicController::class, 'survey'])->name('survey.show');
Route::post('/s/{token}', [PublicController::class, 'answerSurvey'])->middleware('throttle:public-forms')->name('survey.answer');
Route::get('/book/{user}', [PublicController::class, 'booking'])->name('booking.show');
Route::post('/book/{user}', [PublicController::class, 'book'])->middleware('throttle:public-forms')->name('booking.store');
Route::get('/files/{file}', [PublicController::class, 'file'])->middleware(['signed', 'auth'])->name('files.show');

// Phone clock-in for staff (PWA)
Route::middleware('auth')->group(function () {
    Route::get('/clock', [ClockController::class, 'show'])->name('clock');
    Route::post('/clock', [ClockController::class, 'punch'])->middleware('throttle:clock')->name('clock.punch');
});

// Webhooks: signature-verified, replay-protected, rate-limited
Route::middleware('throttle:webhooks')->prefix('webhooks')->group(function () {
    Route::post('/paystack', [WebhookController::class, 'paystack']);
    Route::post('/flutterwave', [WebhookController::class, 'flutterwave']);
    Route::get('/meta', [WebhookController::class, 'metaVerify']);
    Route::post('/meta', [WebhookController::class, 'meta']);
    Route::post('/email', [WebhookController::class, 'email']);
});

// Customer portal (separate guard; carriers, hosting clients, students)
Route::prefix('portal')->group(function () {
    Route::get('/login', [\App\Http\Controllers\PortalController::class, 'loginForm'])->name('portal.login');
    Route::post('/login', [\App\Http\Controllers\PortalController::class, 'login'])->middleware('throttle:public-forms');
    Route::middleware('auth:portal')->group(function () {
        Route::get('/', [\App\Http\Controllers\PortalController::class, 'home'])->name('portal.home');
        Route::post('/logout', [\App\Http\Controllers\PortalController::class, 'logout'])->name('portal.logout');
        Route::post('/routes', [\App\Http\Controllers\PortalController::class, 'requestRoute'])->middleware('throttle:public-forms')->name('portal.routes');
        Route::post('/tickets', [\App\Http\Controllers\PortalController::class, 'ticket'])->middleware('throttle:public-forms')->name('portal.tickets');
    });
});

// v2: private calendar feeds (subscribe from Google Calendar / Outlook) and one-click unsubscribe
Route::get('/calendar/{token}.ics', function (string $token) {
    $u = \App\Models\User::where('calendar_token', $token)->where('status', 'active')->firstOrFail();

    return response(\App\Services\CalendarFeed::forUser($u), 200, ['Content-Type' => 'text/calendar; charset=utf-8', 'Cache-Control' => 'private, max-age=900']);
})->where('token', '[A-Za-z0-9]{48}')->middleware('throttle:60,1')->name('calendar.feed');
Route::get('/unsubscribe/{contact}', function (\App\Models\Contact $contact) {
    \App\Models\Consent::create(['contact_id' => $contact->id, 'channel' => 'email', 'granted' => false, 'source' => 'unsubscribe link', 'ip' => request()->ip()]);

    return view('public.unsubscribed');
})->middleware('signed')->name('unsubscribe');

// Payslip PDF: your own, or anyone's if you can view payroll.
Route::get('/payslips/{payslip}.pdf', function (\App\Models\Payslip $payslip) {
    $u = auth()->user();
    $run = $payslip->payrollRun;
    abort_unless($u->id === $payslip->user_id && in_array($run->status, ['signed_off', 'paid'], true) || \App\Authz\Access::can($u, 'payroll', 'view'), 403);
    \App\Models\AuditLog::record('payslip_downloaded', $payslip);
    $html = view('pdf.payslip', ['b' => $payslip->breakdown, 'user' => $payslip->user, 'month' => \Carbon\Carbon::parse($run->period_month.'-01')->format('F Y')])->render();

    return response(\Barryvdh\DomPDF\Facade\Pdf::loadHTML($html)->output(), 200, ['Content-Type' => 'application/pdf', 'Content-Disposition' => 'attachment; filename="payslip-'.$run->period_month.'.pdf"', 'Cache-Control' => 'private, no-store']);
})->middleware('auth')->name('payslip.pdf');
