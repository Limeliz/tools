# Statistik för Vattensortering

PHP-skript som tar emot anonym statistik från spelet och sparar den i MySQL/MariaDB.
Tänkt att ligga på `https://stats.filidutt.se/vattensort/`.

| Fil | Vad den gör |
|---|---|
| `index.php` | Tar emot händelser från spelet (POST) och sparar dem. |
| `stats.php` | Visar statistiken. Kräver inloggning. |
| `setup.php` | Skapar tabellerna och hjälper dig skapa lösenordet. **Ta bort efter installationen.** |
| `lib.php` | Gemensam kod (anslutning, tabeller). |
| `config.example.php` | Mall för inställningarna. |
| `.htaccess` | Stänger av mapplistning och blockerar direkt åtkomst till inställningar och `lib.php` (Apache). |

## Installation

1. **Skapa en databas och en användare** i webbhotellets kontrollpanel, t.ex. databasen `vattensort` och en användare som bara har rättigheter till den databasen.
2. **Ladda upp** `index.php`, `stats.php`, `setup.php`, `lib.php` och `.htaccess` till `/vattensort/` på servern.
3. **Skapa inställningsfilen** från `config.example.php` och fyll i databasens uppgifter. Lägg den på något av de här ställena (de prövas i den ordningen):
   1. `vattensort-config.php` **två mappnivåer upp** från `/vattensort/`. Det är oftast utanför webbroten, och det är bäst.
   2. `vattensort-config.php` en mappnivå upp (i webbroten).
   3. `config.php` i `/vattensort/`. Den skyddas av `.htaccess`, och eftersom det är en PHP-fil visas aldrig innehållet även om skyddet skulle saknas.
4. **Öppna `https://stats.filidutt.se/vattensort/setup.php`.** Sidan kontrollerar inställningarna och skapar tabellerna. Skriv ett lösenord i formuläret, kopiera hashen den visar och klistra in den som `'admin_password_hash'` i inställningsfilen.
5. **Ta bort `setup.php`** från servern.
6. **Logga in** på `https://stats.filidutt.se/vattensort/stats.php`.

## Hålla lösenord borta från GitHub

- Den riktiga inställningsfilen skapas bara på servern. Den finns aldrig i repot.
- `.gitignore` i den här mappen undantar `config.php` och `vattensort-config.php`, så att de inte kan läggas till av misstag om du skulle spara en kopia här.
- Lösenordet till `stats.php` sparas bara som en hash (`password_hash`), aldrig i klartext.
- Ge databasanvändaren rättigheter bara till statistikdatabasen.

## Vad som samlas in

Spelet skickar händelser när det startar, när en nivå klaras och när ett försök avbryts (Börja om eller byte av nivå efter minst ett drag):

- **Spelar-ID:** ett slumpat UUID som skapas i webbläsaren och sparas i `localStorage`. Två enheter i samma nätverk blir alltså två olika spelare. Rensar man webbläsarens data får enheten ett nytt ID.
- **Klockslag och veckodag** i spelarens lokala tid, och tidszon.
- **För nivåer:** nivå, drag, minsta möjliga antal drag, tid, betyg, antal ångra, tips och extra rör, och antal försök första gången nivån klaras.
- **Övrigt:** spelversion, färgschema, språk och plattform (Android, iOS osv.).
- **Land, region och ort** slås upp från IP-adressen via ip-api.com, högst en gång per spelare och dygn. Det går att stänga av med `'geo_lookup' => false`. **IP-adressen sparas aldrig.** Ligger sajten bakom Cloudflare används landskoden därifrån.

Spelaren kan stänga av statistiken på spelets hjälpsida. I testläget (`#niva-N`) och i förhandsvisningar skickas inget.

Händelserna läggs i en kö i webbläsaren och skickas samlat, så inget försvinner om telefonen är offline. Servern tar emot högst 200 händelser per anrop och högst 2000 per spelare och timme.
