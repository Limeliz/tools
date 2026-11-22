<?php
// Mall för inställningarna till statistiken för Vattensortering.
//
// 1. Kopiera filen till config.php (eller vattensort-config.php, se README.md).
// 2. Fyll i databasens uppgifter och lösenordet till stats.php.
// 3. Lägg aldrig upp config.php på GitHub. Den är undantagen i .gitignore.

return [
    // MySQL / MariaDB
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'vattensort',
    'db_user' => 'vattensort',
    'db_pass' => 'byt-till-databasens-lösenord',

    // Hash av lösenordet till stats.php. Skapa den med formuläret i setup.php
    // (eller: php -r "echo password_hash('ditt-lösenord', PASSWORD_DEFAULT);").
    'admin_password_hash' => '',

    // Slå upp land och ort från spelarens IP-adress via ip-api.com (gratis, utan nyckel).
    // IP-adressen skickas då till ip-api.com men sparas aldrig i databasen.
    // Sätt till false för att bara använda Cloudflares landskod (om sajten ligger bakom Cloudflare).
    'geo_lookup' => true,

    // Vilka webbadresser spelet får skicka statistik från (CORS). '*' tillåter alla.
    'allowed_origins' => ['https://limeliz.github.io'],

    // Tidszon för datum och tider i stats.php.
    'timezone' => 'Europe/Stockholm',
];
