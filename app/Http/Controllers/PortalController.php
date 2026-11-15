<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\Rate;
use App\Models\RouteRequest;
use App\Models\Subscription;
use App\Models\Ticket;
use App\Models\TrafficEntry;
use App\Notifications\Alert;
use App\Services\Ops;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/** Customer portal: carriers see sell rates, invoices, usage, balance and request routes; others see services, invoices, tickets. */
class PortalController extends Controller
{
    public function loginForm()
    {
        return view('portal.login');
    }

    public function login(Request $r)
    {
        $data = $r->validate(['email' => 'required|email', 'password' => 'required|string']);
        $key = 'portal-login:'.strtolower($data['email']).'|'.$r->ip();
        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw ValidationException::withMessages(['email' => 'Too many attempts. Try again in '.RateLimiter::availableIn($key).' seconds.']);
        }
        if (! Auth::guard('portal')->attempt(['email' => strtolower($data['email']), 'password' => $data['password']])) {
            RateLimiter::hit($key, 900);
            throw ValidationException::withMessages(['email' => 'Email or password is incorrect.']);
        }
        RateLimiter::clear($key);
        $r->session()->regenerate();
        Auth::guard('portal')->user()->forceFill(['last_login_at' => now()])->save();

        return redirect('/portal');
    }

    public function logout(Request $r)
    {
        Auth::guard('portal')->logout();
        $r->session()->invalidate();
        $r->session()->regenerateToken();

        return redirect('/portal/login');
    }

    public function home()
    {
        $p = Auth::guard('portal')->user()->load('carrier', 'contact');
        $carrier = $p->carrier;
        $invoices = Invoice::where('kind', 'invoice')->where(fn ($q) => $carrier ? $q->where('carrier_id', $carrier->id) : $q->where('contact_id', $p->contact_id))->where('status', '!=', 'draft')->latest('issue_date')->limit(24)->get();
        $data = ['p' => $p, 'carrier' => $carrier, 'invoices' => $invoices, 'outstanding' => $invoices->sum(fn ($i) => $i->outstanding())];
        if ($carrier) {
            $data['rates'] = Rate::where('carrier_id', $carrier->id)->where('direction', 'sell')->whereNull('effective_to')->whereHas('deck', fn ($q) => $q->where('status', 'active'))->orderBy('destination')->get();
            $data['usage'] = TrafficEntry::where('customer_carrier_id', $carrier->id)->where('date', '>=', today()->subDays(30))->selectRaw('destination, sum(minutes) minutes, sum(revenue) amount')->groupBy('destination')->orderByDesc('minutes')->get();
            $data['requests'] = RouteRequest::where('carrier_id', $carrier->id)->latest()->limit(10)->get();
        } else {
            $data['services'] = Subscription::where('contact_id', $p->contact_id)->orderBy('next_due_on')->get();
            $data['tickets'] = Ticket::where('contact_id', $p->contact_id)->latest()->limit(10)->get();
        }

        return view('portal.home', $data);
    }

    public function requestRoute(Request $r)
    {
        $p = Auth::guard('portal')->user();
        abort_unless($p->carrier_id, 403);
        $data = $r->validate(['destination' => 'required|string|max:120', 'volume' => 'nullable|string|max:120', 'target_rate' => 'nullable|numeric|min:0|max:100']);
        RouteRequest::create($data + ['carrier_id' => $p->carrier_id]);
        Ops::notifyRoles(['telecom_ops'], 'Route request', "{$p->carrier->name} asked for {$data['destination']}", '/app/route-requests');

        return back()->with('status', 'Request sent. Our NOC will reply shortly.');
    }

    public function ticket(Request $r)
    {
        $p = Auth::guard('portal')->user();
        $data = $r->validate(['subject' => 'required|string|max:190', 'body' => 'required|string|max:5000']);
        $unit = $p->contact->primary_unit_id;
        Ticket::create(['unit_id' => $unit, 'number' => 'P-'.strtoupper(substr(bin2hex(random_bytes(4)), 0, 7)), 'contact_id' => $p->contact_id, 'subject' => $data['subject'], 'body' => $data['body']]);

        return back()->with('status', 'Ticket opened. We will reply by email.');
    }
}
