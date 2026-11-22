<?php
// Skickar tillbaka en spelares klarade nivåer, så att spelet kan återställa framsteg som försvunnit
// från webbläsaren. Spelaren identifieras med sitt slumpade spelar-ID (UUID), som bara finns i spelarens webbläsare.
// GET restore.php?pid=<uuid>  →  { "ok": true, "maxLevel": 19, "records": { "18": { "stars": 2, "moves": 30, "time": 61234, "tries": 2 } } }
declare(strict_types=1);
require __DIR__ . '/lib.php';

$cfg = vs_config();
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = $cfg['allowed_origins'] ?? ['*'];
if (in_array('*', $allowed, true)) header('Access-Control-Allow-Origin: *');
elseif ($origin !== '' && in_array($origin, $allowed, true)) { header('Access-Control-Allow-Origin: ' . $origin); header('Vary: Origin'); }
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

$pid = strtolower((string)($_GET['pid'] ?? ''));
if (!$cfg || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $pid)) {
    http_response_code(400); echo json_encode(['ok' => false]); exit;
}
try {
    $db = vs_db();
    $q = $db->prepare("SELECT level,
            MAX(stars) stars,
            MIN(CASE WHEN type IN ('win','import') THEN moves END) moves,
            MIN(CASE WHEN type IN ('win','import') THEN time_ms END) time_ms,
            MAX(CASE WHEN first_clear = 1 THEN tries END) tries,
            MAX(CASE WHEN type = 'win' AND stars >= 2 THEN 1 ELSE 0 END) clean
        FROM events WHERE player_id = ? AND type IN ('win','import') AND level IS NOT NULL
        GROUP BY level ORDER BY level LIMIT 100000");
    $q->execute([$pid]);
    $records = []; $max = 0;
    foreach ($q->fetchAll() as $r) {
        $lvl = (int)$r['level']; $max = max($max, $lvl);
        // bästa drag hör ihop med bästa betyg bara ungefär; spelet slår ihop med sina egna resultat
        $rec = ['stars' => (int)($r['stars'] ?? 1), 'moves' => (int)($r['moves'] ?? 0)];
        if ($r['time_ms'] !== null) $rec['time'] = (int)$r['time_ms'];
        if ($r['tries'] !== null) $rec['tries'] = (int)$r['tries'];
        if ((int)$r['clean'] === 1) $rec['clean'] = true;
        $records[(string)$lvl] = $rec;
    }
    echo json_encode(['ok' => true, 'maxLevel' => $max ? $max + 1 : 0, 'records' => (object)$records]);
} catch (Throwable $e) {
    error_log('vattensort restore: ' . $e->getMessage());
    http_response_code(500); echo json_encode(['ok' => false]);
}
