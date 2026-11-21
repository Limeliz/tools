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
- Du får bara hälla på samma färg eller i ett tomt rör, och bara så mycket som får plats (4 lager per rör).
- Nivån är klar när alla rör är sorterade.

## Funktioner

- Oändligt många nivåer; svårigheten ökar med fler färger (upp till 12). Varje nivå kontrolleras med en lösare så att den alltid går att klara.
- Ångra (5 per nivå), tips (3 per nivå) och ett extra rör per nivå.
- Häll-animation, ljud, vibration och konfetti.
- Framstegen sparas automatiskt i webbläsaren.
