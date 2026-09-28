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

    'sso' => [
        // Secreto compartido con las apps receptoras para canjear tickets SSO server-to-server.
        'shared_secret' => env('SSO_SHARED_SECRET'),
    ],

    /*
    | Aprovisionamiento de usuarios hacia las apps externas (server-to-server).
    | La suite escribe usuarios/permisos directamente en cada app llamando su
    | API /api/provisioning, autenticada con el mismo SSO_SHARED_SECRET.
    | base_urls: base del backend por slug. Si no se define, se usa la `url` de
    | la aplicación en el catálogo. El cliente agrega el sufijo /api/provisioning.
    */
    'provisioning' => [
        'base_urls' => [
            'sigcom' => env('SIGCOM_API_URL', env('SIGCOM_URL')),
            'sigcompro' => env('SIGCOMPRO_API_URL', env('SIGCOMPRO_URL')),
            'sigtraz' => env('SIGTRAZ_API_URL'),
            'creditos' => env('CREDITOS_API_URL'),
            'sigcan' => env('SIGCAN_API_URL', env('SIGCAN_URL')),
            'sigroute' => env('SIGROUTE_API_URL', env('SIGROUTE_URL')),
            'signom' => env('SIGNOM_API_URL', env('SIGNOM_URL')),
            'liquidacion-drivin-web' => env('LIQUIDACION_DRIVIN_API_URL', env('LIQUIDACION_DRIVIN_URL')),
        ],
        // Slugs de apps que exponen la API de aprovisionamiento.
        'apps' => ['sigcom', 'sigcompro', 'sigtraz', 'creditos', 'sigcan', 'sigroute', 'signom', 'liquidacion-drivin-web'],
        'timeout' => (int) env('PROVISIONING_TIMEOUT', 8),
    ],

];
