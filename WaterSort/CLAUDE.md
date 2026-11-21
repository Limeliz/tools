# Vattensortering

- Varje pull request som ändrar spelet ska få en ny version:
  1. Lägg till en post överst i `VERSIONS` i `index.html` (version, datum, PR-nummer, punkter på svenska).
  2. Lägg till samma post överst i `CHANGELOG.md`.
- Ny funktion höjer mellansiffran (1.5.0 → 1.6.0), en ren buggfix höjer sista siffran (1.5.0 → 1.5.1).
- Ljudfilerna i `sounds/` är inbäddade som base64 i `VOICE_B64` i `index.html`; bädda in på nytt om en fil byts ut.
