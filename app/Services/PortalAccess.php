<?php

namespace App\Services;

use App\Models\Contact;
use App\Models\PortalUser;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

/** Customer portal invitations and password resets (signed, expiring links; no password ever sent by email). */
class PortalAccess
{
    public function invite(Contact $c, ?string $carrierId = null): PortalUser
    {
        abort_unless($c->email, 422, 'This customer has no email address.');
        $p = PortalUser::firstOrNew(['email' => strtolower($c->email)]);
        $p->forceFill(['contact_id' => $c->id, 'carrier_id' => $carrierId ?? $p->carrier_id, 'password' => $p->password ?? Str::random(64), 'invite_token' => Str::random(48), 'invited_at' => now()])->save();
        $link = URL::temporarySignedRoute('portal.password', now()->addDays(7), ['portalUser' => $p->id, 'token' => $p->invite_token]);
        Mail::raw("Hello {$c->first_name},\n\nYou now have access to the Figuraid customer portal: rates, invoices, usage and support.\n\nSet your password here (link valid for 7 days):\n$link\n\nFiguraid", fn ($m) => $m->to($p->email)->subject('Your Figuraid customer portal access'));

        return $p;
    }

    public function sendReset(string $email): void
    {
        $p = PortalUser::where('email', strtolower(trim($email)))->first();
        if (! $p) {
            return; // never reveal whether an email is registered
        }
        $p->forceFill(['invite_token' => Str::random(48)])->save();
        $link = URL::temporarySignedRoute('portal.password', now()->addHour(), ['portalUser' => $p->id, 'token' => $p->invite_token]);
        Mail::raw("Use this link within 60 minutes to set a new password for the Figuraid customer portal:\n$link\n\nIf you did not ask for this, ignore this email.", fn ($m) => $m->to($p->email)->subject('Reset your Figuraid portal password'));
    }
}
