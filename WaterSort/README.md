# Vattensortering

Ett färgsorteringspussel (vattensortering) som webbapp för mobilen. Häll färgat vatten mellan rören tills varje rör bara innehåller en färg.

## Spela

Öppna `index.html` i en webbläsare, eller servera mappen och öppna den på telefonen:

```
python -m http.server 8000
```

Gå sedan till `http://<datorns-ip>:8000/` på telefonen. Via HTTPS (t.ex. GitHub Pages) kan appen läggas till på hemskärmen och fungerar offline.

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
- Tryck på nivånumret för att se alla upplåsta nivåer med ditt bästa resultat och spela dem igen.
- Hjälpsidan (frågetecknet) förklarar regler, snabbknep, hjälpmedel och betyg.
- Framstegen sparas automatiskt i webbläsaren.
