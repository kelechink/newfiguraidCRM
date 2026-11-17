<?php

// Every word and claim on the public website lives here so it can be checked in one place.
// PRD v3 §5: no unverified claims. Figures, logos, uptime and testimonials stay out until confirmed.
return [
    'hero' => [
        'title' => 'The world, connected.',
        'lead' => 'Wholesale voice, messaging, numbers and connectivity for carriers and businesses everywhere.',
        'coda' => 'Global wholesale telecom, from Abuja to the world.',
    ],
    'services' => [
        ['key' => 'voice', 'name' => 'Voice', 'line' => 'Wholesale termination and SIP trunking with clear routes, quality you can measure, and billing you can audit.', 'offerings' => [
            ['Wholesale VoIP termination', 'CLI and non-CLI routes, priced per destination, with daily rate updates.'],
            ['SIP trunking', 'Interconnect over SIP with the capacity and codecs your platform needs.'],
            ['Route quality reporting', 'ASR and ACD per destination, so you can see how your traffic performs.'],
        ]],
        ['key' => 'messaging', 'name' => 'Messaging', 'line' => 'Application-to-person messaging that arrives: one-time passwords, alerts and campaigns.', 'offerings' => [
            ['A2P SMS', 'Transactional and promotional SMS through direct and partner routes.'],
            ['OTP delivery', 'Verification codes built for speed, with delivery reports on every message.'],
            ['Short codes', 'Dedicated and shared short codes for two-way campaigns.'],
        ]],
        ['key' => 'numbers', 'name' => 'Numbers and APIs', 'line' => 'Local numbers, number intelligence and programmable APIs to build calling and messaging into your product.', 'offerings' => [
            ['DIDs', 'Local and toll-free numbers for inbound voice and messaging.'],
            ['Number analytics', 'Validate numbers and look up carrier and line type before you send.'],
            ['Programmable APIs', 'Send, receive and route from your own code.'],
        ]],
        ['key' => 'connectivity', 'name' => 'Connectivity', 'line' => 'The layer underneath: mobile data, IoT, signalling and the infrastructure to run a network.', 'offerings' => [
            ['Mobile data and IoT', 'Connectivity for devices and fleets across borders.'],
            ['Signalling', 'Signalling services for operators and service providers.'],
            ['Network and colocation', 'Interconnect, transit and space for your equipment.'],
            ['MVNO and MVNE', 'The enablement to launch and run a mobile brand.'],
        ]],
    ],
    'extra_requestable' => ['TDM voice (on request)', 'Procurement', 'Something else'],
    // TO CONFIRM with the telecom team: which service groups are live in each region.
    'regions' => [
        ['key' => 'africa', 'name' => 'Africa', 'services' => ['voice', 'messaging', 'numbers', 'connectivity']],
        ['key' => 'europe', 'name' => 'Europe', 'services' => ['voice', 'messaging', 'numbers']],
        ['key' => 'middleEast', 'name' => 'Middle East', 'services' => ['voice', 'messaging']],
        ['key' => 'asiaPacific', 'name' => 'Asia Pacific', 'services' => ['voice', 'messaging']],
        ['key' => 'americas', 'name' => 'Americas', 'services' => ['voice', 'messaging', 'numbers']],
    ],
    'industries' => [
        ['Carriers and operators', 'Termination, transit and interconnect between networks.'],
        ['Banks and fintech', 'One-time passwords and alerts that reach customers in seconds.'],
        ['Apps and platforms', 'Messaging and numbers built into your product through our APIs.'],
        ['Contact centres', 'Outbound and inbound voice capacity with local numbers.'],
        ['Enterprises', 'Business messaging, SIP trunks and connectivity under one contract.'],
        ['IoT and logistics', 'Data connectivity for devices that move across borders.'],
    ],
    'insights' => [], // renders only when real posts exist
    'company' => [
        'name' => 'Figuraid Ltd',
        'address' => ['Kano House', '72 Ralph Shodeinde Street', 'Central Business District, Abuja'],
        'email' => env('SITE_SALES_EMAIL', 'sales@figuraid.com'),
        'info_email' => env('SITE_INFO_EMAIL', 'info@figuraid.com'),
        'noc_email' => env('SITE_NOC_EMAIL', 'noc@figuraid.com'),
        'billing_email' => env('SITE_BILLING_EMAIL', 'billing@figuraid.com'),
        'phone' => env('SITE_SALES_PHONE'),
        'social' => array_filter(['LinkedIn' => env('SITE_LINKEDIN'), 'X' => env('SITE_X'), 'Instagram' => env('SITE_INSTAGRAM')]),
    ],
    'other_businesses' => [
        ['Figure Academy', 'Technology training and certification', 'https://figuracademy.org'],
        ['FigureWeb', 'Hosting, domains and business email', 'https://figureweb.ng'],
        ['Procurement', 'Sourcing and supply for organisations', '/request?service=Procurement'],
    ],
    'terms_version' => '2026-11-15',
    'privacy_version' => '2026-11-15',
];
