# blvckTOP v7.2

Addon configurabile per Nuvio/Stremio con Top 10 numerate.

## Novità v7.1

Ogni utente può scegliere **per ogni catalogo**:

- Landscape
- Portrait

La scelta viene salvata nel token cifrato del manifest personale.

### Landscape

- cover 1280×720
- backdrop TMDB `w1280`
- numero a sinistra
- logo ufficiale dentro la card
- `posterShape: "landscape"`

### Portrait

- cover 1000×1500
- poster verticale TMDB `w780`
- numero a sinistra
- logo ufficiale dentro la card
- `posterShape: "poster"`

## Glow automatico per piattaforma

Il numero riceve un glow diverso in base al nome/id del catalogo.

Colori inclusi:

- Netflix → rosso
- Prime Video / Amazon → azzurro
- Disney+ → blu
- Apple TV+ → bianco/grigio freddo
- NOW → ciano
- Paramount+ → blu
- RaiPlay → blu
- Rakuten → rosso scuro
- CHILI → arancio
- HBO / Max → viola
- fallback → viola

La funzione è in `server.js`:

```js
function catalogAccent(catalog) { ... }
```

quindi puoi cambiare i colori facilmente.

## Cache

La v7 include anche le ottimizzazioni di cache:

- cataloghi/manifest/meta sorgente → 5 minuti
- dati TMDB images → 6 ore
- conversione IMDb → TMDB → 24 ore
- download immagini → 6 ore
- cover PNG generate → 24 ore
- richieste simultanee della stessa cover vengono unite
- backdrop landscape TMDB usa `w1280` invece di `original`

Su Render Free la cache RAM viene persa quando l'istanza viene riavviata/spenta.

## Variabili ambiente Render

```env
SOURCE_MANIFEST_URL=https://IL-TUO-MANIFEST-SORGENTE/manifest.json
APP_SECRET=UNA_STRINGA_LUNGA_E_STABILE
```

Non cambiare `APP_SECRET`, altrimenti i manifest già generati smettono di funzionare.

## GitHub / Render

Carica i file nel repository GitHub e lascia che Render faccia il redeploy.

Il progetto include:

- `Dockerfile`
- `render.yaml`
- `.gitignore`

## Compatibilità vecchi token

La v7 continua a interpretare i vecchi token senza `shape` come `landscape`.

Per usare la nuova modalità portrait, gli utenti devono generare un nuovo manifest
dalla home.


## Ritocchi grafici v7.1

### Portrait più grande

La card portrait passa a:

```js
width: 680
height: 1020
```

con canvas 1000×1500, così riempie meglio lo spazio.

### Numero outline

Il numero ora è:

- interno trasparente;
- solo bordo;
- bordo sfumato bianco → grigio chiaro;
- glow colorato dietro in base alla piattaforma;
- stroke leggermente più spesso per mantenere leggibilità su TV.

Il fill del numero è quindi completamente vuoto.


## Sfondo cover configurabile

Ogni catalogo può scegliere anche il background del canvas:

- Trasparente
- Nero #000

La scelta viene salvata nel token insieme a formato e catalogo.
