<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;

/** HSTS, CSP (nonce for inline scripts on the public site), framing, MIME sniffing, referrer, permissions. */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next)
    {
        $nonce = base64_encode(random_bytes(16));
        app()->instance('csp-nonce', $nonce);
        $response = $next($request);
        $h = $response->headers;
        $h->set('X-Content-Type-Options', 'nosniff');
        $h->set('X-Frame-Options', 'DENY');
        $h->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $h->set('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
        $h->set('Cross-Origin-Opener-Policy', 'same-origin');
        if ($request->isSecure()) {
            $h->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        // Filament/Livewire need inline styles and eval-free scripts; the public site uses a nonce.
        $isPanel = $request->is('app', 'app/*', 'livewire/*', 'portal', 'portal/*');
        $script = $isPanel ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'nonce-$nonce' https://challenges.cloudflare.com";
        $h->set('Content-Security-Policy', implode('; ', [
            "default-src 'self'", "script-src $script", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.bunny.net", "font-src 'self' data: https://fonts.gstatic.com https://fonts.bunny.net",
            "img-src 'self' data: blob:", "media-src 'self'", "connect-src 'self' https://*.pusher.com wss://*.pusher.com", 'frame-src https://challenges.cloudflare.com',
            "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'",
        ]));

        return $response;
    }
}
