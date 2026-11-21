# Vattensortering

Ett färgsorteringspussel (vattensortering) som webbapp för mobilen. Häll färgat vatten mellan rören tills varje rör bara innehåller en färg.

## Spela

Öppna `index.html` i en webbläsare, eller servera mappen och öppna den på telefonen:

```
python -m http.server 8000
```

Gå sedan till `http://<datorns-ip>:8000/` på telefonen. Via HTTPS (t.ex. GitHub Pages, https://limeliz.github.io/tools/WaterSort/) kan appen läggas till på hemskärmen och fungerar offline. Appen letar efter en ny version varje gång den startas eller öppnas igen och laddar då om sig själv.

## Testläge

Lägg till `#niva-` och ett nummer i adressen för att prova en valfri nivå, till exempel `https://limeliz.github.io/tools/WaterSort/#niva-300`. I testläget sparas ingenting: dina framsteg, rekord och extra rör påverkas inte. Tryck på "TEST Avsluta" under nivånumret för att gå tillbaka.

## Regler

- Tryck på ett rör för att lyfta det, tryck sedan på ett annat för att hälla.
- Dubbeltryck på röret du häller från för att låsa det, så kan du hälla i flera rör i rad.
- Du får bara hälla på samma färg eller i ett tomt rör, och bara så mycket som får plats (4 lager per rör).
- Nivån är klar när alla rör är sorterade.

## Funktioner

- Oändligt många nivåer; svårigheten ökar med fler färger (upp till 12). Varje nivå kontrolleras med en lösare så att den alltid går att klara.
- Ångra (5 per nivå) och tips (3 per nivå). Extra rör sparas mellan nivåer: du börjar med 0 och får ett nytt första gången du når nivå 5, 10, 15 och så vidare.
- Häll-animation, ljud, vibration och konfetti.
- Klarar du en nivå utan hjälp (ångra, tips, extra rör) säger spelet "Nice!". Klarar du den dessutom på minsta möjliga antal drag säger det "Perfect!". Minsta antal drag räknas fram i bakgrunden när nivån startar.
- Lugn lo-fi-bakgrundsmusik som spelet själv komponerar och spelar upp i realtid, så den är helt fri från royalty. Musiken och ljudeffekterna stängs av med var sin knapp.
- Tiden räknas från första hällningen tills nivån är klar. Tryck på nivånumret för att se alla upplåsta nivåer med ditt bästa betyg, antal drag, snabbaste tid och hur många försök du behövde första gången, och spela dem igen. Nivåer som klarats utan hjälp får en guldram.
- Hjälpsidan (frågetecknet) förklarar regler, snabbknep, hjälpmedel och betyg. Där väljer du också färgschema: Standard, Paired (ColorBrewer Paired-12) eller Original.
- Framstegen sparas automatiskt i webbläsaren.

## Ljud

- `sounds/no-help.mp3` spelas när du klarar en nivå utan hjälp (Nice!) och `sounds/perfect-score.mp3` när du klarar den på minsta antal drag (Perfect!). De är inbäddade i `index.html`, så spelet fungerar som en enda fil. Byter du ut filerna behöver de bäddas in på nytt (base64 i `VOICE_B64`).
- Bakgrundsmusiken och övriga ljudeffekter genereras av spelet självt med Web Audio.

## Versioner

Se [CHANGELOG.md](CHANGELOG.md). Versionen och historiken visas också längst ned på spelets hjälpsida.
