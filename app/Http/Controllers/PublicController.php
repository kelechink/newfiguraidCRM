<?php

namespace App\Http\Controllers;

use App\Models\Booking;
use App\Models\Enrolment;
use App\Models\Invoice;
use App\Models\StoredFile;
use App\Models\Survey;
use App\Models\User;
use App\Notifications\Alert;
use App\Services\InvoiceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PublicController extends Controller
{
    /** QR target on Academy certificates. */
    public function certificate(string $code)
    {
        $e = Enrolment::where('certificate_code', strtoupper($code))->whereNotNull('certificate_issued_at')->with(['contact', 'cohort.course'])->first();

        return view('public.certificate', ['e' => $e, 'code' => $code]);
    }

    public function quote(string $token)
    {
        $q = Invoice::where('public_token', $token)->with(['lines', 'contact', 'carrier', 'unit'])->firstOrFail();

        return view('public.quote', compact('q'));
    }

    /** E-signature: typed name + timestamp + IP, then the quote becomes an invoice. */
    public function signQuote(Request $r, string $token)
    {
        $q = Invoice::where('public_token', $token)->where('kind', 'quote')->whereNull('signed_at')->firstOrFail();
        $data = $r->validate(['signature_name' => 'required|string|max:120', 'agree' => 'accepted']);
        $q->forceFill(['signature_name' => $data['signature_name'], 'signed_at' => now(), 'signed_ip' => $r->ip()])->save();
        $inv = InvoiceService::convertQuote($q);
        User::where('id', $q->created_by_id)->first()?->notify(new Alert('Quote accepted', "$q->number was signed by {$data['signature_name']}. Invoice $inv->number created.", "/app/invoices/$inv->id/edit", true));

        return redirect()->route('quote.show', $inv->public_token)->with('status', 'Thank you — the quote is accepted and your invoice is below.');
    }

    public function survey(string $token)
    {
        return view('public.survey', ['s' => Survey::where('token', $token)->firstOrFail()]);
    }

    public function answerSurvey(Request $r, string $token)
    {
        $s = Survey::where('token', $token)->whereNull('answered_at')->firstOrFail();
        $max = $s->kind === 'nps' ? 10 : 5;
        $data = $r->validate(['score' => "required|integer|min:0|max:$max", 'comment' => 'nullable|string|max:2000']);
        $s->forceFill($data + ['answered_at' => now()])->save();

        return back()->with('status', 'Thank you for your feedback.');
    }

    public function booking(User $user)
    {
        abort_unless($user->status === 'active', 404);
        $taken = Booking::where('user_id', $user->id)->where('starts_at', '>=', now())->pluck('starts_at')->map(fn ($d) => $d->format('Y-m-d H:i'))->all();
        $slots = [];
        for ($d = now('Africa/Lagos')->addDay()->startOfDay(); count($slots) < 30; $d = $d->addDay()) {
            if ($d->isWeekend()) {
                continue;
            }
            foreach (['10:00', '11:00', '12:00', '14:00', '15:00', '16:00'] as $t) {
                $s = $d->copy()->setTimeFromTimeString($t);
                if (! in_array($s->format('Y-m-d H:i'), $taken, true)) {
                    $slots[$d->format('l j M')][] = $s;
                }
            }
            if ($d->diffInDays(now()) > 14) {
                break;
            }
        }

        return view('public.booking', compact('user', 'slots'));
    }

    public function book(Request $r, User $user)
    {
        $data = $r->validate(['name' => 'required|string|max:120', 'email' => 'required|email|max:190', 'starts_at' => 'required|date|after:now', 'notes' => 'nullable|string|max:1000']);
        abort_if(Booking::where('user_id', $user->id)->where('starts_at', $data['starts_at'])->exists(), 409, 'That time was just taken.');
        $b = Booking::create($data + ['user_id' => $user->id]);
        $user->notify(new Alert('New booking', "{$b->name} booked {$b->starts_at->format('D j M H:i')}.", null, true));

        return back()->with('status', 'Booked. You will receive a calendar invitation by email.');
    }

    /** Private files are only ever served through short-lived signed links to signed-in staff. */
    public function file(StoredFile $file)
    {
        return Storage::disk($file->disk)->download($file->path, $file->original_name);
    }
}
