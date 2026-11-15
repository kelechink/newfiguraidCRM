<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],


    // AI providers (free tiers first). Keys live only in .env.
    'ai' => [
        'gemini' => ['key' => env('GEMINI_API_KEY')],
        'groq' => ['key' => env('GROQ_API_KEY')],
        'openrouter' => ['key' => env('OPENROUTER_API_KEY')],
        'mistral' => ['key' => env('MISTRAL_API_KEY')],
        'cerebras' => ['key' => env('CEREBRAS_API_KEY')],
    ],
    'paystack' => ['secret' => env('PAYSTACK_SECRET_KEY')],
    'flutterwave' => ['secret' => env('FLUTTERWAVE_SECRET_KEY'), 'webhook_hash' => env('FLUTTERWAVE_WEBHOOK_HASH')],
    'whmcs' => ['url' => env('WHMCS_URL'), 'identifier' => env('WHMCS_API_IDENTIFIER'), 'secret' => env('WHMCS_API_SECRET'), 'access_key' => env('WHMCS_ACCESS_KEY')],
    'meta' => ['app_secret' => env('META_APP_SECRET'), 'verify_token' => env('META_VERIFY_TOKEN'), 'whatsapp_token' => env('WHATSAPP_TOKEN'), 'page_token' => env('META_PAGE_TOKEN'),
        'whatsapp_numbers' => ['FIGUREWEB' => env('WHATSAPP_PHONE_ID_FIGUREWEB'), 'ACADEMY' => env('WHATSAPP_PHONE_ID_ACADEMY')]],
    'brevo' => ['key' => env('BREVO_API_KEY')],
    'turnstile' => ['site_key' => env('TURNSTILE_SITE_KEY'), 'secret' => env('TURNSTILE_SECRET_KEY')],
    'inbound_email' => ['secret' => env('INBOUND_EMAIL_SECRET')],
    'google' => ['client_id' => env('GOOGLE_CLIENT_ID'), 'client_secret' => env('GOOGLE_CLIENT_SECRET')],
];
