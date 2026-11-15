<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\Consent;
use App\Models\Contact;
use App\Models\DataRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;

/** NDPA 2023 data-subject requests: verify the requester by email, then export, correct or erase within 30 days. */
class DataRights
{
    public function receive(array $data, string $ip): DataRequest
    {
        $r = DataRequest::create($data + ['due_on' => today()->addDays(30), 'ip' => $ip]);
        $r->forceFill(['verify_token' => Str::random(48)])->save();
        $link = URL::temporarySignedRoute('privacy.verify', now()->addDays(7), ['request' => $r->id, 'token' => $r->verify_token]);
        try {
            Mail::raw("We received a request about your personal data at Figuraid ({$r->kind}). To confirm it was you, open this link within 7 days:\n\n$link\n\nIf you did not make this request, ignore this email.", fn ($m) => $m->to($r->email)->subject('Confirm your data request — Figuraid'));
        } catch (\Throwable) {
        }

        return $r;
    }

    public function verify(DataRequest $r, string $token): bool
    {
        if (! $r->verify_token || ! hash_equals($r->verify_token, $token)) {
            return false;
        }
        $contact = Contact::where('email_normalized', strtolower(trim($r->email)))->first();
        $r->forceFill(['status' => 'verified', 'verified_at' => now(), 'verify_token' => null, 'contact_id' => $contact?->id])->save();
        Ops::notifyRoles(['super_admin', 'admin'], 'Verified data-rights request', "{$r->kind} request from {$r->email}. Due ".$r->due_on->format('j M Y').'.', '/app/data-requests', true);

        return true;
    }

    /** Everything we hold about the person (excluding staff-only internal notes from other people). */
    public function export(DataRequest $r): array
    {
        $c = $r->contact;
        if (! $c) {
            return ['note' => 'No customer record found for this email.'];
        }
        AuditLog::record('dsr_export', $r);

        return [
            'profile' => $c->only(['display_name', 'first_name', 'last_name', 'email', 'phone', 'birthday', 'lifecycle', 'tags', 'source_channel', 'created_at']),
            'company' => $c->company?->name,
            'consents' => Consent::where('contact_id', $c->id)->get(['channel', 'granted', 'source', 'created_at']),
            'form_submissions' => DB::table('form_submissions')->where('contact_id', $c->id)->get(['data', 'created_at']),
            'conversations' => $c->conversations()->with('messages:id,conversation_id,direction,body,created_at')->get(['id', 'channel', 'subject', 'created_at']),
            'deals' => $c->deals()->get(['title', 'value', 'currency', 'status', 'created_at']),
            'invoices' => $c->invoices()->get(['number', 'currency', 'total', 'status', 'issue_date']),
            'subscriptions' => $c->subscriptions()->get(['name', 'amount', 'currency', 'next_due_on', 'status']),
        ];
    }

    /**
     * Erase: personal details are removed and marketing stopped. Invoices and payments are kept because tax law
     * requires it, but they no longer carry the person's contact details.
     */
    public function erase(DataRequest $r): void
    {
        $c = $r->contact;
        DB::transaction(function () use ($c, $r) {
            if ($c) {
                $c->forceFill(['first_name' => null, 'last_name' => null, 'display_name' => 'Erased contact '.substr($c->id, -6), 'email' => null, 'phone' => null, 'whatsapp_id' => null, 'teams_handle' => null,
                    'birthday' => null, 'tags' => [], 'destinations' => [], 'utm_source' => null, 'utm_medium' => null, 'utm_campaign' => null, 'lifecycle' => 'archived'])->save();
                DB::table('messages')->whereIn('conversation_id', $c->conversations()->pluck('id'))->update(['body' => '[erased on request]', 'attachments' => null]);
                DB::table('form_submissions')->where('contact_id', $c->id)->update(['data' => json_encode(['erased' => true]), 'ip' => null, 'user_agent' => null]);
                Consent::create(['contact_id' => $c->id, 'channel' => 'email', 'granted' => false, 'source' => 'erasure request']);
                DB::table('portal_users')->where('contact_id', $c->id)->delete();
            }
            $r->forceFill(['status' => 'completed', 'handled_by_id' => auth()->id(), 'outcome' => 'Personal data erased; financial records kept without contact details as required by tax law.'])->save();
            AuditLog::record('dsr_erase', $r);
        });
    }
}
