<?php
// Tar emot statistik från Vattensortering och sparar den i MySQL.
// Spelet skickar en POST med JSON (Content-Type: text/plain, så att webbläsaren inte behöver göra en förfrågan i förväg):
// { "pid": "<uuid>", "v": "1.8.0", "tz": 60, "lang": "sv-SE", "sc": "standard",
//   "events": [ { "t": "start|win|abandon", "ts": 1763800000000, "h": 21, "wd": 6, "lvl": 12, ... } ] }
declare(strict_types=1);
require __DIR__ . '/lib.php';

$cfg = vs_config();

// CORS
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = $cfg['allowed_origins'] ?? ['*'];
if (in_array('*', $allowed, true)) header('Access-Control-Allow-Origin: *');
elseif ($origin !== '' && in_array($origin, $allowed, true)) { header('Access-Control-Allow-Origin: ' . $origin); header('Vary: Origin'); }
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function done(int $code, array $body): void { http_response_code($code); echo json_encode($body); exit; }

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') done(204, []);
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') done(200, ['ok' => true, 'info' => 'Vattensortering statistik']);
if (!$cfg) done(500, ['ok' => false, 'error' => 'config']);

$raw = file_get_contents('php://input', false, null, 0, 65537);
if ($raw === false || strlen($raw) > 65536) done(413, ['ok' => false, 'error' => 'size']);
$in = json_decode($raw, true);
if (!is_array($in)) done(400, ['ok' => false, 'error' => 'json']);

$pid = strtolower((string)($in['pid'] ?? ''));
if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $pid)) done(400, ['ok' => false, 'error' => 'pid']);
$events = $in['events'] ?? [];
if (!is_array($events) || count($events) === 0) done(200, ['ok' => true, 'n' => 0]);
$events = array_slice($events, 0, 200);

$str = fn($v, int $max) => is_string($v) ? mb_substr(preg_replace('/[^\w.\-+ ]/u', '', $v), 0, $max) : null;
$int = function ($v, int $min, int $max) { return (is_int($v) || (is_numeric($v) && (string)(int)$v === (string)$v)) && (int)$v >= $min && (int)$v <= $max ? (int)$v : null; };

$version = $str($in['v'] ?? null, 16);
$lang = $str($in['lang'] ?? null, 16);
$scheme = $str($in['sc'] ?? null, 16);
$tz = $int($in['tz'] ?? null, -840, 840);

$ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
$platform = match (true) {
    (bool)preg_match('/Android/i', $ua) => 'Android',
    (bool)preg_match('/iPhone|iPad|iPod/i', $ua) => 'iOS',
    (bool)preg_match('/Windows/i', $ua) => 'Windows',
    (bool)preg_match('/Macintosh|Mac OS X/i', $ua) => 'Mac',
    (bool)preg_match('/CrOS/i', $ua) => 'ChromeOS',
    (bool)preg_match('/Linux/i', $ua) => 'Linux',
    default => 'Annat',
};

try {
    $db = vs_db();
    $now = gmdate('Y-m-d H:i:s');

    // Enkel spärr mot missbruk: högst 2000 händelser per spelare och timme
    $q = $db->prepare('SELECT COUNT(*) FROM events WHERE player_id = ? AND created_at > ?');
    $q->execute([$pid, gmdate('Y-m-d H:i:s', time() - 3600)]);
    if ((int)$q->fetchColumn() > 2000) done(429, ['ok' => false, 'error' => 'rate']);

    $starts = 0;
    foreach ($events as $e) if (is_array($e) && ($e['t'] ?? '') === 'start') $starts++;

    $db->prepare('INSERT INTO players (id, first_seen, last_seen, sessions, platform, lang, tz_offset, app_version, scheme)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                  ON DUPLICATE KEY UPDATE last_seen = VALUES(last_seen), sessions = sessions + VALUES(sessions),
                  platform = VALUES(platform), lang = COALESCE(VALUES(lang), lang), tz_offset = COALESCE(VALUES(tz_offset), tz_offset),
                  app_version = COALESCE(VALUES(app_version), app_version), scheme = COALESCE(VALUES(scheme), scheme)')
       ->execute([$pid, $now, $now, $starts, $platform, $lang, $tz, $version, $scheme]);

    $ins = $db->prepare('INSERT INTO events (player_id, type, created_at, local_hour, local_weekday, level, moves, min_moves, time_ms,
                         stars, undos, hints, extra, tries, first_clear, already_cleared, scheme, app_version)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    $n = 0;
    $db->beginTransaction();
    foreach ($events as $e) {
        if (!is_array($e)) continue;
        $type = $e['t'] ?? '';
        if (!in_array($type, ['start', 'win', 'abandon'], true)) continue;
        // Händelser som legat i kö (t.ex. offline) får sin egen tid om den är rimlig
        $ts = $int($e['ts'] ?? null, 0, PHP_INT_MAX);
        $when = ($ts !== null && $ts / 1000 > time() - 30 * 86400 && $ts / 1000 < time() + 300) ? gmdate('Y-m-d H:i:s', intdiv($ts, 1000)) : $now;
        $bool = fn($k) => array_key_exists($k, $e) && $e[$k] !== null ? (int)(bool)$e[$k] : null;
        $ins->execute([
            $pid, $type, $when,
            $int($e['h'] ?? null, 0, 23), $int($e['wd'] ?? null, 0, 6),
            $int($e['lvl'] ?? null, 1, 1000000), $int($e['mv'] ?? null, 0, 65535), $int($e['min'] ?? null, 0, 65535),
            $int($e['ms'] ?? null, 0, 4000000000), $int($e['st'] ?? null, 0, 3),
            $int($e['u'] ?? null, 0, 255), $int($e['hi'] ?? null, 0, 255), $int($e['x'] ?? null, 0, 255),
            $int($e['tr'] ?? null, 1, 65535), $bool('fc'), $bool('cl'),
            $str($e['sc'] ?? $scheme, 16), $version,
        ]);
        $n++;
    }
    $db->commit();

    // Land och ort: högst en uppslagning per spelare och dygn
    if ($starts > 0) {
        $q = $db->prepare('SELECT geo_at FROM players WHERE id = ?');
        $q->execute([$pid]);
        $geoAt = $q->fetchColumn();
        if (!$geoAt || strtotime($geoAt . ' UTC') < time() - 86400) {
            $geo = vs_geo($cfg);
            if ($geo) {
                $db->prepare('UPDATE players SET country_code = ?, country = ?, region = ?, city = ?, geo_at = ? WHERE id = ?')
                   ->execute([$geo['cc'], $geo['country'], $geo['region'], $geo['city'], $now, $pid]);
            }
        }
    }
    done(200, ['ok' => true, 'n' => $n]);
} catch (Throwable $ex) {
    error_log('vattensort stats: ' . $ex->getMessage());
    done(500, ['ok' => false, 'error' => 'server']);
}

/** Land och ort för den som anropar. IP-adressen sparas aldrig. */
function vs_geo(array $cfg): ?array {
    $cc = $_SERVER['HTTP_CF_IPCOUNTRY'] ?? '';
    $geo = null;
    if (preg_match('/^[A-Z]{2}$/', $cc) && $cc !== 'XX') $geo = ['cc' => $cc, 'country' => null, 'region' => null, 'city' => null];
    if (empty($cfg['geo_lookup'])) return $geo;
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return $geo;
    $url = 'http://ip-api.com/json/' . rawurlencode($ip) . '?fields=status,countryCode,country,regionName,city&lang=sv';
    $json = null;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 2, CURLOPT_CONNECTTIMEOUT => 2]);
        $json = curl_exec($ch);
        curl_close($ch);
    } elseif (ini_get('allow_url_fopen')) {
        $json = @file_get_contents($url, false, stream_context_create(['http' => ['timeout' => 2]]));
    }
    $d = $json ? json_decode((string)$json, true) : null;
    if (is_array($d) && ($d['status'] ?? '') === 'success') {
        return ['cc' => substr((string)$d['countryCode'], 0, 2), 'country' => mb_substr((string)$d['country'], 0, 64),
                'region' => mb_substr((string)$d['regionName'], 0, 64), 'city' => mb_substr((string)$d['city'], 0, 64)];
    }
    return $geo;
}
