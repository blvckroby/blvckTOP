# Nuvio Top 10 Custom Covers v5

Addon configurabile per Nuvio/Stremio.

## Come funziona

La home mostra **solo**:

1. i cataloghi Top 10 disponibili;
2. il campo TMDB API Key;
3. il pulsante per generare un manifest personale.

L'URL del manifest sorgente non viene mostrato nella pagina.

Ogni utente sceglie i cataloghi che vuole e inserisce la propria TMDB API key.
Il server genera un URL del tipo:

```text
https://tuo-dominio/c/TOKEN_CIFRATO/manifest.json
```

Il token contiene in forma cifrata:

- cataloghi scelti;
- TMDB API key dell'utente.

Non serve un database e non viene creato un `.env` diverso per ogni utente.

## Perché non usare `.env` per ogni utente

`.env` è una configurazione del server, quindi sarebbe condivisa da tutti.
Per un configuratore pubblico serve invece una configurazione personale per ogni
manifest. La v5 usa un token AES-256-GCM cifrato con `APP_SECRET`.

## Variabili d'ambiente richieste

Crea queste variabili sul servizio dove farai girare il backend:

```env
SOURCE_MANIFEST_URL=https://IL-TUO-MANIFEST-SORGENTE/manifest.json
APP_SECRET=una-stringa-molto-lunga-casuale-e-stabile
PORT=3000
```

### IMPORTANTE: APP_SECRET

Non cambiare `APP_SECRET` dopo che gli utenti hanno creato i loro manifest.
Se cambia, i vecchi URL non saranno più decifrabili.

## GitHub

Puoi pubblicare tranquillamente il repository su GitHub.

`.env` è già incluso in `.gitignore`, quindi:

- non pubblicare `SOURCE_MANIFEST_URL` se vuoi tenerlo fuori dal repository;
- non pubblicare `APP_SECRET`;
- imposta entrambi come environment variables sul provider di hosting.

## GitHub Pages

**GitHub Pages da solo non basta**, perché questo progetto contiene un backend
Node.js che genera le cover e interroga TMDB.

Puoi comunque tenere il codice su GitHub e collegare il repository a un hosting
Node/Docker come Render, Railway, Koyeb, Northflank, Fly.io, ecc.

È incluso anche:

```text
Dockerfile
render.yaml
```

per semplificare il deploy.

## Deploy Render da GitHub

1. Carica questa cartella in un repository GitHub.
2. Crea un nuovo Web Service su Render collegato al repository.
3. Render rileverà il `Dockerfile`.
4. Configura:
   - `SOURCE_MANIFEST_URL`
   - `APP_SECRET`
5. Avvia il deploy.
6. Apri il dominio Render.

Con `render.yaml`, `APP_SECRET` può essere generato automaticamente; devi solo
inserire `SOURCE_MANIFEST_URL` nel pannello del servizio.

## Endpoint

Configuratore:

```text
/
```

Cataloghi disponibili:

```text
/api/catalogs
```

Generazione configurazione:

```text
POST /api/generate
```

Manifest personale:

```text
/c/:token/manifest.json
```

Catalogo:

```text
/c/:token/catalog/:type/:catalogId.json
```

Meta:

```text
/c/:token/meta/:type/:id.json
```

Cover:

```text
/c/:token/top-cover
```

## Cover

Le cover sono:

- landscape;
- PNG trasparente;
- numero Top 10 a sinistra;
- backdrop 16:9;
- logo ufficiale TMDB nella card;
- ombra esterna;
- `posterShape: "landscape"` nel catalogo.

Il generatore usa Inter quando disponibile. Il Dockerfile installa `fonts-inter`.
