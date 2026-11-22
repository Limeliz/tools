<?php
// Statistik för Vattensortering. Kräver inloggning med lösenordet i inställningsfilen.
declare(strict_types=1);
require __DIR__ . '/lib.php';
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');
header("Content-Security-Policy: default-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'none'");

$cfg = vs_config();
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('vsstats');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Strict', 'secure' => $https]);
session_start();

if (isset($_GET['logout'])) { $_SESSION = []; session_destroy(); header('Location: stats.php'); exit; }
$err = '';
if (empty($_SESSION['ok']) && ($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $hash = (string)($cfg['admin_password_hash'] ?? '');
    if ($hash !== '' && password_verify((string)($_POST['pw'] ?? ''), $hash)) {
        session_regenerate_id(true);
        $_SESSION['ok'] = true;
        header('Location: stats.php'); exit;
    }
    sleep(1); // bromsa gissningar
    $err = $hash === '' ? 'Inget lösenord är inställt. Skapa ett med setup.php.' : 'Fel lösenord.';
}

$tzName = $cfg['timezone'] ?? 'Europe/Stockholm';
try { $tz = new DateTimeZone($tzName); } catch (Throwable $e) { $tz = new DateTimeZone('UTC'); }
$off = (new DateTime('now', $tz))->format('P'); // t.ex. +01:00, för datum per dag i databasen
$fmtTime = function ($ms): string {
    if ($ms === null) return '–';
    $t = (int)round($ms / 100); $s = intdiv($t, 10);
    return sprintf('%d:%02d,%d', intdiv($s, 60), $s % 60, $t % 10);
};
$local = fn($utc) => $utc ? (new DateTime($utc . ' UTC'))->setTimezone($tz)->format('Y-m-d H:i') : '–';
$pct = fn($v) => $v === null ? '–' : round((float)$v * 100) . ' %';
$num = fn($v, $d = 1) => $v === null ? '–' : number_format((float)$v, $d, ',', ' ');
/** Snygga steg för y-axeln: 0 och 4–6 jämna steg upp till minst $max. */
function nice_ticks(float $max, ?array $steps = null): array {
    if ($max <= 0) $max = 1;
    if ($steps) { // t.ex. jämna tidssteg i sekunder
        $step = end($steps);
        foreach ($steps as $c) if ($max / $c <= 5) { $step = $c; break; }
    } else {
        $raw = $max / 4; $mag = 10 ** floor(log10($raw)); $n = $raw / $mag;
        $step = ($n <= 1 ? 1 : ($n <= 2 ? 2 : ($n <= 2.5 ? 2.5 : ($n <= 5 ? 5 : 10)))) * $mag;
        if ($step < 1 && $max >= 1) $step = 1;
    }
    $ticks = []; for ($v = 0; $v < $max + $step * 0.001; $v += $step) $ticks[] = $v;
    if (end($ticks) < $max) $ticks[] = end($ticks) + $step;
    return $ticks;
}

/**
 * Linjediagram med nivåerna längs x-axeln. $series = [[namn, css-klass, värden indexerade som $levels], ...].
 * Saknade värden bryter linjen. Varje nivå har en osynlig kolumn med verktygstips.
 */
function line_chart(array $levels, array $series, callable $fmt, string $title, int $h = 220, ?array $steps = null): string {
    $n = count($levels);
    if ($n === 0) return '';
    $W = 760; $padL = 56; $padR = 16; $padT = 12; $padB = 30;
    $vals = []; foreach ($series as $sr) foreach ($sr[2] as $v) if ($v !== null) $vals[] = (float)$v;
    $ticks = nice_ticks($vals ? max($vals) : 1, $steps); $ymax = end($ticks);
    $iw = $W - $padL - $padR; $ih = $h - $padT - $padB;
    $x = fn(int $i) => $padL + ($n === 1 ? $iw / 2 : $i * $iw / ($n - 1));
    $y = fn(float $v) => $padT + $ih - $v / $ymax * $ih;
    $o = '<figure class="chart"><figcaption>' . h($title) . '</figcaption>';
    $o .= '<div class="wrap"><svg viewBox="0 0 ' . $W . ' ' . $h . '" role="img" aria-label="' . h($title) . '">';
    foreach ($ticks as $t) {
        $ty = round($y($t), 1);
        $o .= '<line class="grid" x1="' . $padL . '" x2="' . ($W - $padR) . '" y1="' . $ty . '" y2="' . $ty . '"/>';
        $o .= '<text class="ylab" x="' . ($padL - 8) . '" y="' . ($ty + 4) . '">' . h($fmt($t, true)) . '</text>';
    }
    $every = max(1, (int)ceil($n / 12));
    foreach ($levels as $i => $lvl) if ($i % $every === 0 || ($i === $n - 1 && ($n - 1) % $every >= $every / 2)) {
        $o .= '<text class="xlab" x="' . round($x($i), 1) . '" y="' . ($h - 8) . '">' . (int)$lvl . '</text>';
    }
    foreach ($series as [$name, $cls, $data]) {
        $seg = []; $d = '';
        foreach ($levels as $i => $lvl) {
            $v = $data[$i] ?? null;
            if ($v === null) { $seg = []; continue; }
            $pt = round($x($i), 1) . ',' . round($y((float)$v), 1);
            $d .= ($seg ? ' L' : ' M') . $pt; $seg[] = $pt;
        }
        if ($d !== '') $o .= '<path class="line ' . $cls . '" d="' . trim($d) . '"/>';
        if ($n <= 60) foreach ($levels as $i => $lvl) {
            $v = $data[$i] ?? null; if ($v === null) continue;
            $o .= '<circle class="dot ' . $cls . '" cx="' . round($x($i), 1) . '" cy="' . round($y((float)$v), 1) . '" r="4"/>';
        }
    }
    // verktygstips per nivå (hela kolumnen är träffyta)
    $colW = $n === 1 ? $iw : $iw / ($n - 1);
    foreach ($levels as $i => $lvl) {
        $tip = 'Nivå ' . (int)$lvl;
        foreach ($series as [$name, $cls, $data]) $tip .= "\n" . $name . ': ' . (($data[$i] ?? null) === null ? '–' : $fmt((float)$data[$i], false));
        $o .= '<rect class="hit" x="' . round($x($i) - $colW / 2, 1) . '" y="' . $padT . '" width="' . round($colW, 1) . '" height="' . $ih . '"><title>' . h($tip) . '</title></rect>';
    }
    $o .= '<line class="axis" x1="' . $padL . '" x2="' . ($W - $padR) . '" y1="' . ($padT + $ih) . '" y2="' . ($padT + $ih) . '"/>';
    $o .= '</svg></div><div class="legend">';
    foreach ($series as [$name, $cls]) $o .= '<span><i class="' . $cls . '"></i>' . h($name) . '</span>';
    return $o . '<span class="muted">Nivå →</span></div></figure>';
}

/** Graferna ovanför nivåtabellen: Tid, eller Drag och försök (två grafer med samma nivåaxel). */
function level_charts(array $rows, callable $fmtTime): string {
    if (!$rows) return '<p class="muted">Ingen data för de här nivåerna än.</p>';
    $lv = array_map(fn($r) => (int)$r['level'], $rows);
    $col = fn(string $k) => array_map(fn($r) => $r[$k] === null ? null : (float)$r[$k], $rows);
    $sec = fn(float $v, bool $axis) => $axis ? ($v >= 60 ? sprintf('%d:%02d', intdiv((int)$v, 60), (int)$v % 60) : (int)$v . ' s') : $fmtTime($v * 1000);
    $toSec = fn(array $a) => array_map(fn($v) => $v === null ? null : $v / 1000, $a);
    $int = fn(float $v, bool $axis) => $axis ? (string)(int)round($v) : number_format($v, 1, ',', '');
    $o = '<div class="charttabs">';
    $o .= '<input type="radio" name="chart" id="ch-time" checked><label for="ch-time">Tid</label>';
    $o .= '<input type="radio" name="chart" id="ch-moves"><label for="ch-moves">Drag och försök</label>';
    $o .= '<div class="pane pane-time box">' . line_chart($lv, [['Snitt', 's1', $toSec($col('avgt'))], ['Snabbast', 's2', $toSec($col('bestt'))]], $sec, 'Tid per nivå (klarade nivåer)', 240,
        [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 300, 600, 900, 1200, 1800, 3600]) . '</div>';
    $o .= '<div class="pane pane-moves box">'
        . line_chart($lv, [['Snitt', 's1', $col('avgm')], ['Minsta möjliga', 's2', $col('minm')]], $int, 'Antal drag', 200)
        . line_chart($lv, [['Snitt', 's1', $col('tries')], ['Max', 's2', $col('maxtries')]], $int, 'Försök innan nivån klarades första gången', 170)
        . '</div></div>';
    return $o;
}

function bar(float $part, float $max): string {
    $w = $max > 0 ? max(1, round($part / $max * 100)) : 0;
    return '<span class="bar"><i style="width:' . $w . '%"></i></span>';
}
?><!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Vattensortering – statistik</title>
<style>
  :root { --bg: #14123a; --card: #201d52; --line: #36327a; --fg: #eef0ff; --muted: #a9acd6; --accent: #5ee7ff; --gold: #ffd60a; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--fg); }
  main { max-width: 1100px; margin: 0 auto; padding: 20px max(16px, env(safe-area-inset-left, 0px)) 48px; }
  h1 { margin: 0 0 4px; font-size: 26px; } h2 { margin: 32px 0 10px; font-size: 19px; color: var(--accent); }
  a { color: var(--accent); }
  .muted { color: var(--muted); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .tile { background: var(--card); border-radius: 14px; padding: 12px 14px; }
  .tile b { display: block; font-size: 26px; font-variant-numeric: tabular-nums; }
  .tile span { color: var(--muted); font-size: 13px; }
  .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; }
  .box { background: var(--card); border-radius: 14px; padding: 12px 14px; min-width: 0; }
  .scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th, td { padding: 6px 8px; text-align: right; border-bottom: 1px solid var(--line); white-space: nowrap; }
  th:first-child, td:first-child { text-align: left; }
  th { color: var(--muted); font-weight: 600; font-size: 13px; position: sticky; top: 0; background: var(--card); }
  td.l { text-align: left; }
  .bar { display: inline-block; width: 120px; height: 10px; background: #2c2970; border-radius: 5px; vertical-align: middle; margin-left: 8px; overflow: hidden; }
  .bar i { display: block; height: 100%; background: var(--accent); border-radius: 5px; }
  .hours { display: grid; grid-template-columns: repeat(24, 1fr); gap: 3px; align-items: end; height: 140px; margin-top: 8px; }
  .hours div { background: var(--accent); border-radius: 4px 4px 0 0; min-height: 2px; position: relative; }
  .hours-l { display: grid; grid-template-columns: repeat(24, 1fr); gap: 3px; font-size: 11px; color: var(--muted); text-align: center; margin-top: 4px; }
  .login { max-width: 340px; margin: 12vh auto; background: var(--card); padding: 24px; border-radius: 16px; }
  input, button { font: inherit; padding: 9px 12px; border-radius: 9px; border: 1px solid var(--line); background: #2a2766; color: var(--fg); width: 100%; }
  button { background: #3a66ff; border: none; margin-top: 10px; cursor: pointer; font-weight: 700; }
  .err { color: #ff6b81; }
  .top { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  form.inline { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  form.inline input { width: 90px; } form.inline button { width: auto; margin: 0; padding: 8px 14px; }
  code { background: #2a2766; padding: 1px 5px; border-radius: 5px; }
  /* grafer: snitt = blå, bästa/max = orange (validerade mot ytan #201d52) */
  :root { --s1: #3987e5; --s2: #d95926; }
  .charttabs { margin: 12px 0 14px; position: relative; }
  .charttabs input { position: absolute; left: 0; top: 0; width: 1px; height: 1px; margin: 0; opacity: 0; pointer-events: none; }
  .charttabs label { display: inline-block; padding: 7px 14px; border-radius: 999px; background: #2a2766; color: var(--muted); cursor: pointer; font-weight: 600; margin: 0 6px 10px 0; }
  .charttabs input:checked + label { background: var(--accent); color: #14123a; }
  .charttabs input:focus-visible + label { outline: 2px solid var(--fg); outline-offset: 2px; }
  .pane { display: none; }
  #ch-time:checked ~ .pane-time, #ch-moves:checked ~ .pane-moves { display: block; }
  .chart { margin: 0 0 10px; }
  .chart figcaption { font-weight: 600; margin: 2px 0 4px; }
  .chart .wrap { overflow-x: auto; }
  .chart svg { width: 100%; min-width: 560px; height: auto; display: block; }
  .chart .grid { stroke: var(--line); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .chart .axis { stroke: var(--muted); stroke-width: 1; vector-effect: non-scaling-stroke; }
  .chart text { fill: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .chart .ylab { text-anchor: end; } .chart .xlab { text-anchor: middle; }
  .chart .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
  .chart .line.s1 { stroke: var(--s1); } .chart .line.s2 { stroke: var(--s2); }
  .chart .dot { stroke: var(--card); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .chart .dot.s1 { fill: var(--s1); } .chart .dot.s2 { fill: var(--s2); }
  .chart .hit { fill: transparent; } .chart .hit:hover { fill: rgba(255,255,255,.06); }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; color: var(--fg); margin-top: 2px; }
  .legend i { display: inline-block; width: 16px; height: 3px; border-radius: 2px; vertical-align: middle; margin-right: 6px; }
  .legend i.s1 { background: var(--s1); } .legend i.s2 { background: var(--s2); }
</style></head><body><main>
<?php if (empty($_SESSION['ok'])): ?>
  <form class="login" method="post">
    <h1>Statistik</h1><p class="muted">Vattensortering</p>
    <?php if (!$cfg): ?><p class="err">Inställningsfilen saknas. Se setup.php.</p><?php endif; ?>
    <?php if ($err): ?><p class="err"><?= h($err) ?></p><?php endif; ?>
    <input type="password" name="pw" placeholder="Lösenord" autofocus required>
    <button>Logga in</button>
  </form>
<?php else:
  try { $db = vs_db(); } catch (Throwable $e) { echo '<p class="err">Databasfel: ' . h($e->getMessage()) . '</p></main></body></html>'; exit; }
  $one = fn(string $sql, array $p = []) => (function () use ($db, $sql, $p) { $q = $db->prepare($sql); $q->execute($p); return $q->fetchColumn(); })();
  $all = fn(string $sql, array $p = []) => (function () use ($db, $sql, $p) { $q = $db->prepare($sql); $q->execute($p); return $q->fetchAll(); })();
  $ago = fn(int $sec) => gmdate('Y-m-d H:i:s', time() - $sec);

  $player = isset($_GET['player']) && preg_match('/^[0-9a-f-]{36}$/', (string)$_GET['player']) ? (string)$_GET['player'] : null;
?>
  <div class="top">
    <div><h1>Vattensortering – statistik</h1><span class="muted">Tider i <?= h($tzName) ?>. Spelarnas klockslag är deras egen lokala tid.</span></div>
    <div><?php if ($player): ?><a href="stats.php">← Översikt</a> · <?php endif; ?><a href="?logout=1">Logga ut</a></div>
  </div>

<?php if ($player):
  $p = $all('SELECT * FROM players WHERE id = ?', [$player])[0] ?? null;
  if (!$p) { echo '<p>Okänd spelare.</p>'; } else { ?>
  <h2>Spelare <?= h(substr($player, 0, 8)) ?></h2>
  <div class="tiles">
    <div class="tile"><b><?= h($p['country'] ?? $p['country_code'] ?? '–') ?></b><span><?= h($p['city'] ?? '') ?></span></div>
    <div class="tile"><b><?= h($p['platform'] ?? '–') ?></b><span>plattform</span></div>
    <div class="tile"><b><?= (int)$p['sessions'] ?></b><span>starter</span></div>
    <div class="tile"><b style="font-size:16px"><?= h($local($p['first_seen'])) ?></b><span>första gången</span></div>
    <div class="tile"><b style="font-size:16px"><?= h($local($p['last_seen'])) ?></b><span>senast</span></div>
  </div>
  <h2>Nivåer</h2>
  <div class="box scroll"><table>
    <tr><th>Nivå</th><th>Försök till första klarning</th><th>Importerad</th><th>Vinster</th><th>Avbrutna</th><th>Bästa tid</th><th>Bästa drag</th><th>Minsta möjliga</th><th>Bästa betyg</th><th>Ångra</th><th>Tips</th><th>Extra rör</th></tr>
    <?php foreach ($all("SELECT level, MAX(CASE WHEN type IN ('win','import') AND first_clear=1 THEN tries END) tries, SUM(type='import') imp, SUM(type='win') wins, SUM(type='abandon') ab,
        MIN(CASE WHEN type IN ('win','import') THEN time_ms END) best, MIN(CASE WHEN type IN ('win','import') THEN moves END) mv, MIN(min_moves) mn, MAX(stars) st,
        SUM(undos) u, SUM(hints) hi, SUM(extra) x FROM events WHERE player_id = ? AND type IN ('win','abandon','import') GROUP BY level ORDER BY level", [$player]) as $r): ?>
      <tr><td><?= (int)$r['level'] ?></td><td><?= $r['tries'] ?? '–' ?></td><td><?= $r['imp'] ? 'ja' : '' ?></td><td><?= (int)$r['wins'] ?></td><td><?= (int)$r['ab'] ?></td>
        <td><?= $fmtTime($r['best']) ?></td><td><?= $r['mv'] ?? '–' ?></td><td><?= $r['mn'] ?? '–' ?></td>
        <td style="color:var(--gold)"><?= $r['st'] !== null ? str_repeat('★', (int)$r['st']) . str_repeat('☆', 3 - (int)$r['st']) : '–' ?></td>
        <td><?= (int)$r['u'] ?></td><td><?= (int)$r['hi'] ?></td><td><?= (int)$r['x'] ?></td></tr>
    <?php endforeach; ?>
  </table></div>
<?php } else:
  // ---------- Översikt ----------
  $players = (int)$one('SELECT COUNT(*) FROM players');
  $a1 = (int)$one('SELECT COUNT(*) FROM players WHERE last_seen > ?', [$ago(86400)]);
  $a7 = (int)$one('SELECT COUNT(*) FROM players WHERE last_seen > ?', [$ago(7 * 86400)]);
  $a30 = (int)$one('SELECT COUNT(*) FROM players WHERE last_seen > ?', [$ago(30 * 86400)]);
  $sessions = (int)$one('SELECT COALESCE(SUM(sessions),0) FROM players');
  $wins = (int)$one("SELECT COUNT(*) FROM events WHERE type='win'");
  $abandons = (int)$one("SELECT COUNT(*) FROM events WHERE type='abandon'");
  $imports = (int)$one("SELECT COUNT(*) FROM events WHERE type='import'");
  $playMs = (int)$one("SELECT COALESCE(SUM(time_ms),0) FROM events WHERE type IN ('win','abandon')");
?>
  <h2>Översikt</h2>
  <div class="tiles">
    <div class="tile"><b><?= $players ?></b><span>unika spelare</span></div>
    <div class="tile"><b><?= $a1 ?></b><span>aktiva senaste dygnet</span></div>
    <div class="tile"><b><?= $a7 ?></b><span>aktiva senaste 7 dagarna</span></div>
    <div class="tile"><b><?= $a30 ?></b><span>aktiva senaste 30 dagarna</span></div>
    <div class="tile"><b><?= $sessions ?></b><span>starter av spelet</span></div>
    <div class="tile"><b><?= $wins ?></b><span>klarade nivåer</span></div>
    <div class="tile"><b><?= $abandons ?></b><span>avbrutna försök</span></div>
    <div class="tile"><b><?= $imports ?></b><span>importerade nivåer (klarade före 1.8.0)</span></div>
    <div class="tile"><b><?= $num($playMs / 3600000) ?> h</b><span>speltid (mätt)</span></div>
  </div>

  <div class="grid2">
    <div>
      <h2>När på dygnet</h2>
      <div class="box">
        <?php $hours = array_fill(0, 24, 0);
        foreach ($all('SELECT local_hour h, COUNT(DISTINCT player_id, DATE(created_at)) n FROM events WHERE local_hour IS NOT NULL GROUP BY local_hour') as $r) $hours[(int)$r['h']] = (int)$r['n'];
        $mx = max($hours) ?: 1; ?>
        <span class="muted">Antal spelare som spelat per timme (spelarens lokala tid), räknat en gång per dag.</span>
        <div class="hours"><?php foreach ($hours as $hh => $n): ?><div title="<?= $hh ?>:00 – <?= $n ?>" style="height:<?= round($n / $mx * 100) ?>%"></div><?php endforeach; ?></div>
        <div class="hours-l"><?php for ($i = 0; $i < 24; $i++) echo '<span>' . ($i % 3 === 0 ? $i : '') . '</span>'; ?></div>
      </div>
      <h2>Veckodag</h2>
      <div class="box"><table>
        <?php $days = ['Söndag', 'Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag']; $wd = array_fill(0, 7, 0);
        foreach ($all('SELECT local_weekday d, COUNT(DISTINCT player_id, DATE(created_at)) n FROM events WHERE local_weekday IS NOT NULL GROUP BY local_weekday') as $r) $wd[(int)$r['d']] = (int)$r['n'];
        $mx = max($wd) ?: 1;
        foreach ([1, 2, 3, 4, 5, 6, 0] as $d): ?><tr><td><?= $days[$d] ?></td><td><?= $wd[$d] ?><?= bar($wd[$d], $mx) ?></td></tr><?php endforeach; ?>
      </table></div>
    </div>
    <div>
      <h2>Spelare per dag (30 dagar)</h2>
      <div class="box scroll"><table>
        <tr><th>Datum</th><th>Aktiva</th><th>Nya</th></tr>
        <?php $act = []; $new = [];
        foreach ($all("SELECT DATE(CONVERT_TZ(created_at, '+00:00', ?)) d, COUNT(DISTINCT player_id) n FROM events WHERE created_at > ? GROUP BY d", [$off, $ago(30 * 86400)]) as $r) $act[$r['d']] = (int)$r['n'];
        foreach ($all("SELECT DATE(CONVERT_TZ(first_seen, '+00:00', ?)) d, COUNT(*) n FROM players WHERE first_seen > ? GROUP BY d", [$off, $ago(30 * 86400)]) as $r) $new[$r['d']] = (int)$r['n'];
        $mx = max($act ?: [1]);
        for ($i = 0; $i < 30; $i++) { $d = (new DateTime("-$i days", $tz))->format('Y-m-d'); $n = $act[$d] ?? 0; ?>
          <tr><td><?= $d ?></td><td><?= $n ?><?= bar($n, $mx) ?></td><td><?= $new[$d] ?? 0 ?></td></tr>
        <?php } ?>
      </table></div>
    </div>
  </div>

  <div class="grid2">
    <div>
      <h2>Länder</h2>
      <div class="box scroll"><table><tr><th>Land</th><th>Spelare</th></tr>
        <?php $rows = $all("SELECT COALESCE(country, country_code, 'Okänt') c, COUNT(*) n FROM players GROUP BY c ORDER BY n DESC LIMIT 30"); $mx = $rows ? (int)$rows[0]['n'] : 1;
        foreach ($rows as $r): ?><tr><td><?= h($r['c']) ?></td><td><?= (int)$r['n'] ?><?= bar((int)$r['n'], $mx) ?></td></tr><?php endforeach; ?>
      </table></div>
    </div>
    <div>
      <h2>Orter</h2>
      <div class="box scroll"><table><tr><th>Ort</th><th>Spelare</th></tr>
        <?php $rows = $all("SELECT CONCAT(COALESCE(city,'?'), ', ', COALESCE(region,''), ' ', COALESCE(country_code,'')) c, COUNT(*) n FROM players WHERE city IS NOT NULL GROUP BY c ORDER BY n DESC LIMIT 30"); $mx = $rows ? (int)$rows[0]['n'] : 1;
        foreach ($rows as $r): ?><tr><td><?= h($r['c']) ?></td><td><?= (int)$r['n'] ?><?= bar((int)$r['n'], $mx) ?></td></tr><?php endforeach; ?>
      </table></div>
    </div>
    <div>
      <h2>Plattform och färgschema</h2>
      <div class="box scroll"><table><tr><th>Plattform</th><th>Spelare</th></tr>
        <?php foreach ($all("SELECT COALESCE(platform,'?') p, COUNT(*) n FROM players GROUP BY p ORDER BY n DESC") as $r): ?><tr><td><?= h($r['p']) ?></td><td><?= (int)$r['n'] ?></td></tr><?php endforeach; ?>
        <tr><th>Färgschema</th><th>Spelare</th></tr>
        <?php foreach ($all("SELECT COALESCE(scheme,'?') s, COUNT(*) n FROM players GROUP BY s ORDER BY n DESC") as $r): ?><tr><td><?= h($r['s']) ?></td><td><?= (int)$r['n'] ?></td></tr><?php endforeach; ?>
      </table></div>
    </div>
  </div>

  <?php
  $maxLvl = (int)$one("SELECT COALESCE(MAX(level),1) FROM events");
  $from = max(1, (int)($_GET['from'] ?? 1)); $to = max($from, min($from + 199, (int)($_GET['to'] ?? min($maxLvl, $from + 49))));
  ?>
  <h2>Nivåer</h2>
  <form class="inline" method="get"><span class="muted">Visa nivå</span> <input type="number" name="from" min="1" value="<?= $from ?>"> <span class="muted">till</span> <input type="number" name="to" min="1" value="<?= $to ?>"> <button>Visa</button> <span class="muted">(högsta spelade: <?= $maxLvl ?>)</span></form>
  <?php $levelRows = $all("SELECT level, COUNT(DISTINCT player_id) tried, COUNT(DISTINCT CASE WHEN type IN ('win','import') THEN player_id END) cleared,
        SUM(type='win') wins, SUM(type='abandon') ab,
        AVG(CASE WHEN type IN ('win','import') AND first_clear=1 THEN tries END) tries, MAX(CASE WHEN type IN ('win','import') AND first_clear=1 THEN tries END) maxtries,
        AVG(CASE WHEN type='win' THEN time_ms END) avgt, MIN(CASE WHEN type IN ('win','import') THEN time_ms END) bestt,
        AVG(CASE WHEN type='win' THEN moves END) avgm, MIN(min_moves) minm,
        AVG(CASE WHEN type='win' THEN stars=3 END) perf,
        AVG(CASE WHEN type='win' THEN undos>0 END) pu, AVG(CASE WHEN type='win' THEN hints>0 END) ph, AVG(CASE WHEN type='win' THEN extra>0 END) px,
        SUM(undos) su, SUM(hints) sh, SUM(extra) sx
        FROM events WHERE type IN ('win','abandon','import') AND level BETWEEN ? AND ? GROUP BY level ORDER BY level", [$from, $to]);
  echo level_charts($levelRows, $fmtTime); ?>
  <p class="muted">Försök = hur många försök spelarna behövde innan de klarade nivån första gången. Hjälpmedel = andel av vinsterna där hjälpmedlet användes, och totalt antal användningar (även i avbrutna försök).
  Nivåer som klarades före version 1.8.0 är importerade med spelarens bästa resultat: de räknas i <i>Har klarat</i>, <i>Försök</i> och <i>Bästa tid</i>, men inte i vinster, snitt eller hjälpmedel.</p>
  <div class="box scroll"><table>
    <tr><th>Nivå</th><th>Har spelat</th><th>Har klarat</th><th>Vinster</th><th>Avbrutna</th><th>Försök snitt</th><th>Försök max</th>
      <th>Tid snitt</th><th>Bästa tid</th><th>Drag snitt</th><th>Minsta</th><th>Perfect</th><th>Ångra</th><th>Tips</th><th>Extra rör</th></tr>
    <?php foreach ($levelRows as $r): ?>
      <tr><td><?= (int)$r['level'] ?></td><td><?= (int)$r['tried'] ?></td><td><?= (int)$r['cleared'] ?></td><td><?= (int)$r['wins'] ?></td><td><?= (int)$r['ab'] ?></td>
        <td><?= $num($r['tries']) ?></td><td><?= $r['maxtries'] ?? '–' ?></td>
        <td><?= $fmtTime($r['avgt']) ?></td><td><?= $fmtTime($r['bestt']) ?></td><td><?= $num($r['avgm']) ?></td><td><?= $r['minm'] ?? '–' ?></td>
        <td><?= $pct($r['perf']) ?></td>
        <td><?= $pct($r['pu']) ?> <span class="muted">(<?= (int)$r['su'] ?>)</span></td>
        <td><?= $pct($r['ph']) ?> <span class="muted">(<?= (int)$r['sh'] ?>)</span></td>
        <td><?= $pct($r['px']) ?> <span class="muted">(<?= (int)$r['sx'] ?>)</span></td></tr>
    <?php endforeach; ?>
  </table></div>

  <h2>Senaste spelarna</h2>
  <div class="box scroll"><table>
    <tr><th>Spelare</th><th>Land</th><th>Ort</th><th>Plattform</th><th>Starter</th><th>Högsta klarade</th><th>Vinster</th><th>Speltid</th><th>Första gången</th><th>Senast</th></tr>
    <?php foreach ($all("SELECT p.*, s.maxlvl, s.wins, s.ms FROM players p LEFT JOIN (
        SELECT player_id, MAX(CASE WHEN type IN ('win','import') THEN level END) maxlvl, SUM(type='win') wins, SUM(time_ms) ms FROM events GROUP BY player_id
      ) s ON s.player_id = p.id ORDER BY p.last_seen DESC LIMIT 50") as $r): ?>
      <tr><td class="l"><a href="?player=<?= h($r['id']) ?>"><code><?= h(substr($r['id'], 0, 8)) ?></code></a></td>
        <td class="l"><?= h($r['country'] ?? $r['country_code'] ?? '–') ?></td><td class="l"><?= h($r['city'] ?? '–') ?></td>
        <td class="l"><?= h($r['platform'] ?? '–') ?></td><td><?= (int)$r['sessions'] ?></td><td><?= $r['maxlvl'] ?? '–' ?></td>
        <td><?= (int)$r['wins'] ?></td><td><?= $fmtTime($r['ms']) ?></td><td><?= h($local($r['first_seen'])) ?></td><td><?= h($local($r['last_seen'])) ?></td></tr>
    <?php endforeach; ?>
  </table></div>
<?php endif; endif; ?>
</main></body></html>
