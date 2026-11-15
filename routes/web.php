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
