@extends('site.layout')
@section('content')
<article class="wrap legal-page on-light" data-tone="light">
<h1 class="t-h2">Privacy Policy</h1>
<p>Version {{ config('site.privacy_version') }}. Written to meet the Nigeria Data Protection Act 2023.</p>
<h2>What we collect</h2><p>When you submit a form or chat with us: your name, company, work email, phone number, the services and destinations you ask about, and your message. We also record the date, time, IP address and the version of these terms you accepted, and whether you opted in to marketing.</p>
<h2>Why we use it</h2><p>To reply to your enquiry, prepare quotes, onboard you as a customer or supplier, provide and bill services, meet legal and regulatory duties, and — only if you ticked the box — send you product updates and route offers.</p>
<h2>Lawful basis</h2><p>Steps you ask us to take before a contract, performance of a contract, our legitimate interest in running and securing our business, legal obligation, and your consent for marketing, which you can withdraw at any time.</p>
<h2>AI services</h2><p>Our assistant uses third-party AI models to draft replies. We send only your message and public information about our services; we mask email addresses and phone numbers before sending, and never send financial, rate or staff data.</p>
<h2>Who we share it with</h2><p>Service providers that host our systems, send email and messages, and process payments, under contracts that protect your data; and regulators or law enforcement where the law requires. We do not sell personal data.</p>
<h2>How long we keep it</h2><p>Enquiries that do not proceed are deleted after 90 days without follow-up. Customer and billing records are kept for as long as the law requires (generally six years after the relationship ends).</p>
<h2>Security</h2><p>Encryption in transit and for sensitive fields at rest, access limited by role, two-factor sign-in for privileged staff, and an audit trail. If a breach is likely to risk your rights, we will notify the Nigeria Data Protection Commission within 72 hours and tell you without undue delay.</p>
<h2>Your rights</h2><p>You can ask to access, correct, delete or port your data, object to processing, or withdraw consent. Contact us at the address below; we reply within 30 days. You may also complain to the Nigeria Data Protection Commission.</p>
<h2>Contact</h2><p>{{ config('site.company.name') }}, {{ implode(', ', config('site.company.address')) }}@if(config('site.company.email')) — {{ config('site.company.email') }}@endif.</p>
</article>
@endsection
