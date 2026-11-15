<?php

namespace App\Http\Controllers;

use App\Models\BusinessUnit;
use App\Models\Consent;
use App\Models\Contact;
use App\Models\Conversation;
use App\Models\Deal;
use App\Models\FormSubmission;
use App\Models\LeadForm;
use App\Models\Message;
use App\Models\Pipeline;
use App\Services\Agents;
use App\Services\InboxRouter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

class SiteController extends Controller
{
    public function home()
    {
        return view('site.home');
    }

    public function request(Request $r)
    {
        return view('site.request', ['preset' => $r->query('service')]);
    }

    public function legal(string $doc)
    {
        return view("site.$doc", ['title' => ($doc === 'terms' ? 'Terms and Conditions' : 'Privacy Policy').' — Figuraid']);
    }

    public function sitemap()
    {
        $urls = collect(['/', '/request', '/terms', '/privacy'])->map(fn ($u) => '<url><loc>'.e(url($u)).'</loc></url>')->implode('');

        return response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'.$urls.'</urlset>', 200, ['Content-Type' => 'application/xml']);
    }

    public static function verifyTurnstile(?string $token, string $ip): bool
    {
        $secret = config('services.turnstile.secret');
        if (! $secret) {
            return true; // not configured: honeypot + rate limit still apply
        }
        if (! $token) {
            return false;
        }

        return (bool) Http::asForm()->timeout(10)->post('https://challenges.cloudflare.com/turnstile/v0/siteverify', ['secret' => $secret, 'response' => $token, 'remoteip' => $ip])->json('success');
    }

    /** Request-a-service form → contact + deal in the right pipeline, consent stored (PRD §11a), acknowledgement email. */
    public function submit(Request $r)
    {
        if ($r->filled('website')) {
            return back()->with('request_sent', true); // honeypot: pretend success
        }
        $data = $r->validate([
            'service' => 'required|string|max:80',
            'destinations' => 'nullable|string|max:300',
            'volume' => 'nullable|string|max:120',
            'name' => 'required|string|max:120',
            'company' => 'required|string|max:160',
            'email' => 'required|email:rfc|max:190',
            'phone' => 'nullable|string|max:40',
            'message' => 'nullable|string|max:3000',
        ], [
            'service.required' => 'Choose the service you need.', 'name.required' => 'Enter your full name.', 'company.required' => 'Enter your company name.',
            'email.required' => 'Enter your work email.', 'email.email' => 'Enter an email like name@company.com.',
        ]);
        if (! self::verifyTurnstile($r->input('cf-turnstile-response'), $r->ip())) {
            throw ValidationException::withMessages(['form' => 'Please complete the check and try again.']);
        }
        $unitCode = match (true) {
            $data['service'] === 'Procurement' => 'PROCUREMENT',
            default => 'TELECOM',
        };
        $unit = BusinessUnit::where('code', $unitCode)->firstOrFail();
        $utm = array_filter($r->only(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']));

        $contact = DB::transaction(function () use ($data, $unit, $utm, $r) {
            [$first, $last] = array_pad(explode(' ', trim($data['name']), 2), 2, null);
            $email = strtolower(trim($data['email']));
            $company = \App\Models\Company::firstOrCreate(['name' => trim($data['company'])]);
            $contact = Contact::where('email_normalized', $email)->first() ?? new Contact(['primary_unit_id' => $unit->id, 'lifecycle' => 'lead', 'source_channel' => 'form', 'source_detail' => 'Website: request a service']);
            $contact->fill(['first_name' => $first, 'last_name' => $last, 'display_name' => trim($data['name']), 'email' => $email, 'phone' => $data['phone'] ?? $contact->phone, 'company_id' => $company->id,
                'utm_source' => $utm['utm_source'] ?? $contact->utm_source, 'utm_medium' => $utm['utm_medium'] ?? $contact->utm_medium, 'utm_campaign' => $utm['utm_campaign'] ?? $contact->utm_campaign,
                'destinations' => array_values(array_filter(array_map('trim', explode(',', (string) ($data['destinations'] ?? ''))))), 'last_activity_at' => now()])->save();
            $contact->units()->syncWithoutDetaching([$unit->id]);
            $form = LeadForm::firstOrCreate(['slug' => 'website-request'], ['unit_id' => $unit->id, 'name' => 'Website: request a service', 'fields' => ['service', 'destinations', 'volume', 'name', 'company', 'email', 'phone', 'message']]);
            FormSubmission::create(['lead_form_id' => $form->id, 'contact_id' => $contact->id, 'data' => $data, 'utm' => $utm, 'ip' => $r->ip(), 'user_agent' => mb_substr((string) $r->userAgent(), 0, 300),
                'accepted' => ['terms_version' => config('site.terms_version'), 'privacy_version' => config('site.privacy_version'), 'at' => now()->toIso8601String(), 'ip' => $r->ip()]]);
            Consent::create(['contact_id' => $contact->id, 'channel' => 'email', 'granted' => $r->boolean('marketing'), 'source' => 'website request form', 'notice_version' => config('site.privacy_version'), 'ip' => $r->ip()]);
            $pipeline = Pipeline::where('unit_id', $unit->id)->where('kind', 'sales')->orderBy('position')->first();
            if ($pipeline) {
                Deal::create(['unit_id' => $unit->id, 'pipeline_id' => $pipeline->id, 'stage_id' => $pipeline->stages()->first()->id, 'contact_id' => $contact->id, 'company_id' => $company->id,
                    'title' => "{$data['service']} — {$data['company']}", 'source' => 'website', 'next_action' => 'Reply with rates and next steps', 'next_action_on' => today()]);
            }
            $conv = Conversation::create(['unit_id' => $unit->id, 'contact_id' => $contact->id, 'channel' => 'webchat', 'subject' => "Website request: {$data['service']}"]);
            Message::create(['conversation_id' => $conv->id, 'direction' => 'in', 'author_type' => 'contact', 'body' => collect($data)->except(['name', 'email', 'phone'])->filter()->map(fn ($v, $k) => ucfirst($k).": $v")->implode("\n"), 'delivery' => 'delivered']);
            $conv->forceFill(['last_customer_message_at' => now()])->save();
            app(InboxRouter::class)->assign($conv);

            return $contact;
        });
        try {
            Mail::raw("Hello {$contact->first_name},\n\nThanks for contacting Figuraid. We received your request for {$data['service']} and a member of our team will reply with rates and next steps.\n\nWhat you sent:\n".collect($data)->only(['service', 'destinations', 'volume', 'company', 'message'])->filter()->map(fn ($v, $k) => ucfirst($k).": $v")->implode("\n")."\n\nFiguraid Ltd\nKano House, 72 Ralph Shodeinde Street, Central Business District, Abuja", fn ($m) => $m->to($contact->email)->subject('We received your request — Figuraid'));
        } catch (\Throwable) {
        }

        return redirect(url()->previous().'#request')->with('request_sent', true);
    }

    /** Website assistant: answers from public knowledge; captures an email into a lead + conversation. */
    public function chat(Request $r, Agents $agents)
    {
        $msg = (string) $r->validate(['message' => 'required|string|max:1000'])['message'];
        $history = (array) $r->session()->get('chat.history', []);
        [$reply, $handoff] = $agents->websiteReply(implode("\n", array_slice($history, -10)), $msg);
        $history[] = "Visitor: $msg";
        $history[] = "Ada: $reply";
        $r->session()->put('chat.history', array_slice($history, -20));
        if (preg_match('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', $msg, $m) || $r->session()->has('chat.conversation')) {
            $conv = Conversation::find($r->session()->get('chat.conversation'));
            if (! $conv && isset($m[0])) {
                $unit = BusinessUnit::where('code', 'TELECOM')->first();
                $email = strtolower($m[0]);
                $contact = Contact::firstOrCreate(['email_normalized' => $email], ['email' => $email, 'display_name' => $email, 'primary_unit_id' => $unit->id, 'source_channel' => 'chat', 'source_detail' => 'Website assistant', 'lifecycle' => 'lead']);
                $conv = Conversation::create(['unit_id' => $unit->id, 'contact_id' => $contact->id, 'channel' => 'webchat', 'subject' => 'Website chat', 'agent_key' => 'front_desk']);
                foreach (array_slice($history, 0, -2) as $line) {
                    Message::create(['conversation_id' => $conv->id, 'direction' => str_starts_with($line, 'Ada:') ? 'out' : 'in', 'author_type' => str_starts_with($line, 'Ada:') ? 'agent' : 'contact', 'agent_key' => str_starts_with($line, 'Ada:') ? 'front_desk' : null, 'body' => preg_replace('/^(Visitor|Ada): /', '', $line)]);
                }
                $r->session()->put('chat.conversation', $conv->id);
                app(InboxRouter::class)->assign($conv);
            }
            if ($conv) {
                Message::create(['conversation_id' => $conv->id, 'direction' => 'in', 'author_type' => 'contact', 'body' => $msg]);
                Message::create(['conversation_id' => $conv->id, 'direction' => 'out', 'author_type' => 'agent', 'agent_key' => 'front_desk', 'body' => $reply]);
                $conv->forceFill(['last_customer_message_at' => now(), 'first_response_at' => $conv->first_response_at ?? ($handoff ? null : now())])->save();
            }
        }

        return response()->json(['reply' => $reply, 'handoff' => $handoff]);
    }
}
