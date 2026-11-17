<?php

// Figuraid mailboxes the system reads (IMAP) and replies from (SMTP).
// Passwords live only in the server .env. A mailbox without a password is simply not checked.
return [
    'host' => env('MAILBOX_HOST', 'mail.figuraid.com'),
    'port' => (int) env('MAILBOX_PORT', 993),
    'encryption' => env('MAILBOX_ENCRYPTION', 'ssl'),
    'validate_cert' => (bool) env('MAILBOX_VALIDATE_CERT', true),

    'boxes' => [
        'rates' => [
            'address' => env('MAILBOX_RATES', 'rates@figuraid.com'),
            'aliases' => ['rate@figuraid.com'],
            'password' => env('MAILBOX_RATES_PASSWORD'),
            'unit' => 'TELECOM', 'category' => 'rates', 'priority' => 'normal',
            'purpose' => 'Vendor rate sheets: imported automatically, prices and contacts updated',
        ],
        'noc' => [
            'address' => env('MAILBOX_NOC', 'noc@figuraid.com'),
            'password' => env('MAILBOX_NOC_PASSWORD'),
            'unit' => 'TELECOM', 'category' => 'support', 'priority' => 'high',
            'purpose' => 'Network operations: faults, tests, route issues',
        ],
        'sales' => [
            'address' => env('MAILBOX_SALES', 'sales@figuraid.com'),
            'password' => env('MAILBOX_SALES_PASSWORD'),
            'unit' => 'TELECOM', 'category' => 'sales', 'priority' => 'normal',
            'purpose' => 'New business and quotes',
        ],
        'billing' => [
            'address' => env('MAILBOX_BILLING', 'billing@figuraid.com'),
            'password' => env('MAILBOX_BILLING_PASSWORD'),
            'unit' => 'TELECOM', 'category' => 'billing', 'priority' => 'normal', 'notify' => ['finance'],
            'purpose' => 'Invoices, statements, payments and disputes',
        ],
        'info' => [
            'address' => env('MAILBOX_INFO', 'info@figuraid.com'),
            'password' => env('MAILBOX_INFO_PASSWORD'),
            'unit' => 'TELECOM', 'category' => null, 'priority' => 'normal',
            'purpose' => 'General enquiries (Ada classifies them)',
        ],
    ],

    // Which address sends what
    'send_as' => [
        'invoices' => env('MAILBOX_BILLING', 'billing@figuraid.com'),
        'broadcasts' => env('MAILBOX_RATES', 'rates@figuraid.com'),
        'campaigns' => env('MAILBOX_SALES', 'sales@figuraid.com'),
        'system' => env('MAILBOX_INFO', 'info@figuraid.com'),
    ],
];
