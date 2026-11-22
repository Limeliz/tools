# Versionshistorik – Vattensortering

Varje pull request får en ny version. Samma lista finns i `VERSIONS` i `index.html` och visas längst ned på spelets hjälpsida.

## 1.8.0 – 2026-11-22 (PR #11)
- Anonym statistik: varje enhet får ett slumpat spelar-ID och spelet skickar start, klarade nivåer och avbrutna försök till statistikservern.
- Statistiken kan stängas av på hjälpsidan.
- PHP-skript för statistikservern i `stats/`.

## 1.7.0 – 2026-11-21 (PR #10)
- Välj färgschema på hjälpsidan: Standard, Paired (ColorBrewer Paired-12) eller Original från version 1.0.

## 1.6.0 – 2026-11-21 (PR #9)
- Ny färgpalett med 12 färger som är lättare att skilja åt: bara en grön, ljusrosa i stället för rosa, och vitt och svart har tillkommit.
- Nivåerna är desamma som förut, så rekord och tider gäller fortfarande.
- Testläge: lägg till `#niva-300` i adressen för att prova valfri nivå utan att något sparas.

## 1.5.1 – 2026-11-21 (PR #8)
- Appen på hemskärmen hämtar alltid senaste versionen och laddar om sig själv när en ny version finns.

## 1.5.0 – 2026-11-21 (PR #7)
- Nivåer som klarats utan hjälp får en guldram i nivålistan.
- Hjälpsidan beskriver vinstljud, tid, försök och markeringarna i nivålistan.
- Versionsnummer och versionshistorik längst ned på hjälpsidan.

## 1.4.0 – 2026-11-21 (PR #6)
- Antal försök tills en nivå klaras första gången visas i vinstrutan och nivålistan.

## 1.3.0 – 2026-11-21 (PR #5)
- Tidtagning från första hällningen tills nivån är klar.
- Snabbaste tid sparas per nivå och visas i nivålistan.
- Tystare ljud för Perfect!.

## 1.2.0 – 2026-11-21 (PR #4)
- Vinstljud för Nice! och Perfect!, och minsta möjliga antal drag räknas fram.
- Lo-fi-bakgrundsmusik med egen av/på-knapp.
- Dubbeltryck på källröret låser det för flera hällningar i rad.
- Hjälpsida och nivåväljare med bästa resultat.
- Extra rör delas ut på nivå 5, 10, 15 … och sparas mellan nivåer.

## 1.1.0 – 2026-11-21 (PR #3)
- Häller åt andra hållet när rören trycks i fel ordning.

## 1.0.0 – 2026-11-21 (PR #2)
- Första versionen: oändligt många lösbara nivåer, ångra, tips och extra rör.
- Snabb hällanimation och flera hällningar samtidigt.
- Ingen zoom eller textmarkering på mobilen.
