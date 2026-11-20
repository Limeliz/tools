# Nätverksplaneraren

Ett grafiskt verktyg i webbläsaren för att planera nätverk: lägg till enheter, koppla ihop dem
och se direkt om switcharna räcker till för portar och PoE. Det ger också förslag på en bättre switch
eller på att dela upp enheterna på flera switchar.

Det behövs ingen server, inget byggsteg och inga beroenden. Öppna `index.html` i webbläsaren.

## Funktioner

- **Flera fysiskt separata nätverk**: varje flik är ett eget nätverk.
- **Enheter**: Starlink, 5G-router (Teltonika), fiber/modem, gateway, switch, accesspunkt, kamera,
  PTZ, NVR/server, arbetsstation, laptop, mobil, skrivare, TV, IP-telefon, övrigt/IoT.
- **Katalog** med UniFi-gateways, switchar, AP och Protect-kameror, Teltonika RUTX50/RUTM50/RUTX11/TRB500/OTD500,
  Starlink Gen3/Gen2/Mini och generiska enheter. Du kan också välja *Anpassad* och ange portar, PoE och budget själv.
- **Automatisk analys** för varje switch och router:
  - antal RJ45- och SFP-portar som används jämfört med vad som finns
  - antal PoE-portar och om PoE-klassen räcker (PoE/PoE+/PoE++)
  - PoE-budget, med varning över 80 %
  - genomströmmande PoE, t.ex. USW-Flex som matas via PoE och själv matar kameror
  - WAN-anslutning, slingor, oanslutna enheter och WiFi-klienter utan accesspunkt
- **Förslag**: knappen *Byt* byter till en switchmodell som räcker. *Lägg till en switch* flyttar
  så få enheter som möjligt till en ny switch.
- **Samma switch**: markera flera enheter och välj *Anslut alla* till en switch, eller
  *Skapa ny switch för markerade*. Då väljs automatiskt en modell som räcker för portar och PoE.
- **Rapport** med materiallista per nätverk och totalt, port- och PoE-sammanställning och
  problemlista. Rapporten kan skrivas ut eller sparas som CSV.
- **Export och import**: projektet som JSON. Nätverksbilden kan exporteras som SVG eller PNG.
  Projektet sparas också automatiskt i webbläsaren (localStorage).

## Användning

| Gör så här | För att |
|---|---|
| Klicka eller dra en enhet från paletten | lägga till den (ange *Antal* överst för att lägga till flera) |
| Markera en switch och klicka sedan på en enhet i paletten | lägga till enheten direkt kopplad till switchen |
| Dra från pricken under en enhet till en annan enhet | koppla ihop dem (WiFi-klienter kopplas trådlöst till en AP) |
| Dra på bakgrunden / scrolla | panorera / zooma |
| Skift + dra på bakgrunden, Skift + klicka | markera flera |
| Del, Ctrl+D, Ctrl+A, Ctrl+Z / Ctrl+Y, Ctrl+S | ta bort, duplicera, markera alla, ångra/gör om, exportera |
| *Ordna* | ordna enheterna automatiskt som ett träd från internetkällan |

Portfärger på switcharna: grön betyder använd, orange använd med PoE, grå ledig och röd problem.
Blå kant betyder WAN-port och en fyrkantig port är SFP.

## Egna modeller

Alla modeller finns i `catalog.js`. Formatet förklaras överst i filen. Specifikationerna är
ungefärliga, så **kontrollera alltid mot tillverkarens datablad** innan du köper något.
