<?php
// Gemensam kod för statistiken till Vattensortering. Anropas inte direkt.
declare(strict_types=1);

if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'lib.php') { http_response_code(404); exit; }

/** Läser inställningarna. Letar först utanför webbmappen, sedan i samma mapp. */
function vs_config(): array {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $candidates = [];
    if (getenv('VATTENSORT_CONFIG')) $candidates[] = getenv('VATTENSORT_CONFIG');
    $candidates[] = dirname(__DIR__, 2) . '/vattensort-config.php';  // två nivåer upp, ofta utanför webbroten
    $candidates[] = dirname(__DIR__) . '/vattensort-config.php';     // en nivå upp
    $candidates[] = __DIR__ . '/config.php';                         // samma mapp (skyddas av .htaccess)
    foreach ($candidates as $f) {
        if (is_file($f)) {
            $c = require $f;
            if (is_array($c)) { $c['_file'] = $f; return $cfg = $c; }
        }
    }
    return $cfg = [];
}

function vs_db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = vs_config();
    if (!$c) throw new RuntimeException('config saknas');
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $c['db_host'] ?? 'localhost', (int)($c['db_port'] ?? 3306), $c['db_name'] ?? '');
    $pdo = new PDO($dsn, $c['db_user'] ?? '', $c['db_pass'] ?? '', [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '+00:00'");
    return $pdo;
}

function h($s): string { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

/** Databasens tabeller. Används av setup.php. */
function vs_schema(): array {
    return [
        "CREATE TABLE IF NOT EXISTS players (
            id CHAR(36) NOT NULL PRIMARY KEY,
            first_seen DATETIME NOT NULL,
            last_seen DATETIME NOT NULL,
            sessions INT UNSIGNED NOT NULL DEFAULT 0,
            country_code CHAR(2) NULL,
            country VARCHAR(64) NULL,
            region VARCHAR(64) NULL,
            city VARCHAR(64) NULL,
            geo_at DATETIME NULL,
            platform VARCHAR(16) NULL,
            lang VARCHAR(16) NULL,
            tz_offset SMALLINT NULL,
            app_version VARCHAR(16) NULL,
            scheme VARCHAR(16) NULL,
            INDEX (last_seen), INDEX (first_seen), INDEX (country_code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
        "CREATE TABLE IF NOT EXISTS events (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            player_id CHAR(36) NOT NULL,
            type VARCHAR(12) NOT NULL,
            created_at DATETIME NOT NULL,
            local_hour TINYINT UNSIGNED NULL,
            local_weekday TINYINT UNSIGNED NULL,
            level INT UNSIGNED NULL,
            moves SMALLINT UNSIGNED NULL,
            min_moves SMALLINT UNSIGNED NULL,
            time_ms INT UNSIGNED NULL,
            stars TINYINT UNSIGNED NULL,
            undos TINYINT UNSIGNED NULL,
            hints TINYINT UNSIGNED NULL,
            extra TINYINT UNSIGNED NULL,
            tries SMALLINT UNSIGNED NULL,
            first_clear TINYINT(1) NULL,
            already_cleared TINYINT(1) NULL,
            scheme VARCHAR(16) NULL,
            app_version VARCHAR(16) NULL,
            INDEX (type, level), INDEX (player_id), INDEX (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ];
}
