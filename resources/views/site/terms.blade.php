@extends('site.layout')
@section('content')
<article class="wrap legal-page on-light" data-tone="light">
<h1 class="t-h2">Terms and Conditions</h1>
<p>Version {{ config('site.terms_version') }}. Draft for legal review before launch.</p>
<h2>1. Who we are</h2><p>These terms govern use of figuraid.com and enquiries made through it. The site is operated by {{ config('site.company.name') }}, {{ implode(', ', config('site.company.address')) }}, Nigeria ("Figuraid", "we").</p>
<h2>2. Enquiries and quotes</h2><p>Information on this site describes services in general terms. It is not an offer. Rates, coverage, capacity and service levels are confirmed only in a written quote or a signed service agreement, which takes precedence over anything on this site.</p>
<h2>3. Acceptable use</h2><p>You must not use our services or this site for fraud, unsolicited bulk messaging, traffic pumping, artificially inflated traffic, illegal content, or any purpose prohibited by the Nigerian Communications Commission or the laws of the destination country. We may suspend traffic that we reasonably believe breaches this clause.</p>
<h2>4. Carrier onboarding</h2><p>Wholesale customers and vendors must complete our know-your-customer checks and sign an interconnect or service agreement before traffic is exchanged.</p>
<h2>5. Billing</h2><p>Charges, billing increments, billing cycles, currency and payment terms are those stated in your agreement or invoice. Disputes must be raised in writing within the period stated in your agreement.</p>
<h2>6. AI assistant</h2><p>The chat assistant on this site is automated. Its answers are general information and may be wrong; it cannot agree prices, discounts, refunds or contracts. A member of staff confirms anything binding in writing.</p>
<h2>7. Liability</h2><p>To the extent permitted by law, we are not liable for indirect or consequential loss arising from use of this site. Nothing in these terms limits liability that cannot be limited by law.</p>
<h2>8. Changes and law</h2><p>We may update these terms; the version and date above show the current text. These terms are governed by the laws of the Federal Republic of Nigeria and the courts of the Federal Capital Territory, Abuja.</p>
</article>
@endsection
