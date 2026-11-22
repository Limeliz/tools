<?php
// Tillfällig fil: skapar databasens tabeller och hjälper dig att skapa lösenordshash till stats.php.
// TA BORT FILEN FRÅN SERVERN NÄR DU ÄR KLAR.
declare(strict_types=1);
require __DIR__ . '/lib.php';
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
$cfg = vs_config();
$hash = null;
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST' && isset($_POST['pw']) && strlen((string)$_POST['pw']) >= 8) {
    $hash = password_hash((string)$_POST['pw'], PASSWORD_DEFAULT);
}
?><!doctype html>
<html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Vattensortering – installation</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px 16px; background: #14123a; color: #eef; }
  .ok { color: #5eea7d; } .err { color: #ff6b81; } code, pre { background: #26235e; padding: 2px 6px; border-radius: 6px; }
  pre { padding: 12px; overflow-x: auto; white-space: pre-wrap; word-break: break-all; }
  input, button { font: inherit; padding: 8px 12px; border-radius: 8px; border: 1px solid #555a9a; background: #26235e; color: #fff; }
  button { background: #3a66ff; border: none; cursor: pointer; }
  .warn { background: #5a1f2c; padding: 12px 16px; border-radius: 10px; }
</style></head><body>
<h1>Installation av statistiken</h1>
<p class="warn"><b>Ta bort setup.php från servern när du är klar.</b></p>

<h2>1. Inställningar</h2>
<?php if (!$cfg): ?>
  <p class="err">Hittar ingen inställningsfil.</p>
  <p>Kopiera <code>config.example.php</code> till <code>config.php</code> i den här mappen, eller till
  <code>vattensort-config.php</code> en eller två mappnivåer upp (utanför webbroten om möjligt), och fyll i databasens uppgifter.</p>
<?php else: ?>
  <p class="ok">Inställningar hittade: <code><?= h(basename($cfg['_file'])) ?></code>
  <?= str_starts_with($cfg['_file'], __DIR__) ? '(i webbmappen, skyddad av .htaccess)' : '(utanför webbmappen – bra)' ?></p>
<?php endif; ?>

<h2>2. Databasen</h2>
<?php
if ($cfg) {
    try {
        $db = vs_db();
        foreach (vs_schema() as $sql) $db->exec($sql);
        $tables = $db->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
        echo '<p class="ok">Anslutningen fungerar. Tabellerna finns: ' . h(implode(', ', $tables)) . '.</p>';
        $players = (int)$db->query('SELECT COUNT(*) FROM players')->fetchColumn();
        $events = (int)$db->query('SELECT COUNT(*) FROM events')->fetchColumn();
        echo "<p>Hittills: $players spelare och $events händelser.</p>";
    } catch (Throwable $e) {
        echo '<p class="err">Kunde inte ansluta eller skapa tabellerna: ' . h($e->getMessage()) . '</p>';
    }
} else echo '<p>Väntar på inställningarna.</p>';
?>

<h2>3. Lösenord till stats.php</h2>
<?php if ($cfg && !empty($cfg['admin_password_hash'])): ?>
  <p class="ok">Ett lösenord är redan inställt.</p>
<?php endif; ?>
<form method="post" autocomplete="off">
  <p>Skriv ett lösenord (minst 8 tecken) så skapas en hash som du klistrar in som
  <code>'admin_password_hash'</code> i inställningsfilen. Själva lösenordet sparas inte.</p>
  <input type="password" name="pw" minlength="8" required placeholder="Nytt lösenord"> <button>Skapa hash</button>
</form>
<?php if ($hash): ?>
  <p>Klistra in den här raden i inställningsfilen:</p>
  <pre>'admin_password_hash' => '<?= h($hash) ?>',</pre>
<?php endif; ?>

<h2>4. Klart</h2>
<p>Öppna <a href="stats.php">stats.php</a> och logga in. Ta sedan bort setup.php.</p>
</body></html>
