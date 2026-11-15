<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/** Staff in "onboarding" must sign the contract pack and accept the internal privacy policy before work modules open. */
class RequireContractSigned
{
    public function handle(Request $request, Closure $next)
    {
        $u = $request->user();
        if ($u && $u->status === 'onboarding' && ! $request->is('app', 'app/onboarding*', 'app/profile*', 'app/logout', 'app/multi-factor*', 'livewire/*')) {
            return redirect('/app/onboarding');
        }

        return $next($request);
    }
}
