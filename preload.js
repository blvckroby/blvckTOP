import cron from "node-cron";
import {
  getCachedJson,
  setCachedJson,
  getCoverFilePath,
  saveCoverBuffer,
  pruneStaleCovers
} from "./db.js";
import {
  resolveTmdbId,
  getTmdbImages,
  chooseBackdrop,
  choosePoster,
  DEFAULT_TMDB_KEY
} from "./tmdb.js";
import { createTopCover } from "./cover-generator.js";

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function sourceBaseUrl(sourceManifestUrl) {
  return sourceManifestUrl.replace(/\/manifest\.json(?:\?.*)?$/i, "");
}

function catalogAccent(catalog = {}) {
  const key = `${catalog.id || ""} ${catalog.name || ""}`.toLowerCase();

  if (key.includes("netflix")) return "#E50914";
  if (key.includes("prime") || key.includes("amazon")) return "#00A8E1";
  if (key.includes("disney")) return "#2D7DFF";
  if (key.includes("apple")) return "#D8DFEA";
  if (key.includes("now") || key.includes("sky")) return "#00CFFF";
  if (key.includes("paramount")) return "#0064FF";
  if (key.includes("raiplay") || key.includes("rai")) return "#1C6DFF";
  if (key.includes("rakuten")) return "#BF0000";
  if (key.includes("chili")) return "#FF5A1F";
  if (key.includes("max") || key.includes("hbo")) return "#7D57FF";
  if (key.includes("infinity") || key.includes("mediaset")) return "#00A3E0";
  if (key.includes("timvision") || key.includes("tim")) return "#003399";
  if (key.includes("discovery")) return "#003399";

  return "#8C75FF";
}

export const COVER_VERSION = "v7.5.0";

export function computeCoverKey({
  rank,
  type,
  shape,
  tmdbId,
  catalogId,
  canvasBackground,
  accent,
  artworkUrl,
  genre,
  rating,
  showLogo
}) {
  return [
    COVER_VERSION,
    rank,
    type,
    shape,
    tmdbId || "",
    catalogId || "",
    canvasBackground || "transparent",
    accent || "#FFFFFF",
    artworkUrl || "",
    genre || "",
    rating || "",
    showLogo !== false && showLogo !== "false" ? "1" : "0"
  ].join("|");
}

export async function preloadAllCatalogs(sourceManifestUrl, options = {}) {
  if (!sourceManifestUrl) return;

  const startTime = Date.now();
  console.log(`[Preload] Inizio sincronizzazione e pre-caching Top 10...`);

  let newCoversGenerated = 0;
  let skippedCovers = 0;
  let catalogCount = 0;
  const activeTuples = new Set();

  try {
    const manifestResponse = await fetch(sourceManifestUrl, {
      headers: { "User-Agent": "blvckTOP/7.3" }
    });

    if (!manifestResponse.ok) {
      throw new Error(`Manifest sorgente non raggiungibile (${manifestResponse.status})`);
    }

    const sourceManifest = await manifestResponse.json();

    const catalogs = (Array.isArray(sourceManifest.catalogs) ? sourceManifest.catalogs : [])
      .filter(c => {
        const id = String(c.id || "").toLowerCase();
        const name = String(c.name || "").toLowerCase();
        if (id.includes("last-video") || id.includes("calendar-video")) return false;
        if (name.includes("last video") || name.includes("calendar video")) return false;
        return true;
      });
    catalogCount = catalogs.length;

    for (const cat of catalogs) {
      const type = cat.type;
      const catId = cat.id;
      const accent = catalogAccent(cat);

      const catalogUrl = `${sourceBaseUrl(sourceManifestUrl)}/catalog/${encodeURIComponent(type)}/${encodeURIComponent(catId)}.json`;

      try {
        const catRes = await fetch(catalogUrl, {
          headers: { "User-Agent": "blvckTOP/7.3" }
        });

        if (!catRes.ok) continue;

        const catData = await catRes.json();
        setCachedJson(catalogUrl, catData, 30 * 60 * 1000);

        const metas = Array.isArray(catData.metas) ? catData.metas : [];

        for (let i = 0; i < Math.min(metas.length, 10); i++) {
          const meta = metas[i];
          const rank = i + 1;
          const genre = Array.isArray(meta.genres) && meta.genres.length > 0 ? meta.genres[0] : (meta.genre || "");
          const rating = meta.imdbRating || meta.rating || "";

          try {
            const tmdbId = await resolveTmdbId(type, meta.id || meta.tmdbId, DEFAULT_TMDB_KEY);
            if (!tmdbId) continue;

            const normType = type === "series" ? "tv" : type;
            activeTuples.add(`${catId}|${type}|${rank}|${tmdbId}`);
            activeTuples.add(`${catId}|${normType}|${rank}|${tmdbId}`);

            const images = await getTmdbImages(type, tmdbId, DEFAULT_TMDB_KEY);

            // Pre-generate standard configurations
            const shapes = ["landscape", "poster"];
            const backgrounds = ["transparent", "black", "stremio", "provider"];
            const metaFlags = [true];
            const logoFlags = [true];

            for (const shape of shapes) {
              const artworkUrl = shape === "poster"
                ? choosePoster(images)
                : chooseBackdrop(images);

              for (const canvasBackground of backgrounds) {
                for (const showMeta of metaFlags) {
                  for (const showLogo of logoFlags) {
                    const effectiveGenre = showMeta ? genre : "";
                    const effectiveRating = showMeta ? rating : "";

                    const coverKey = computeCoverKey({
                      rank,
                      type: normType,
                      shape,
                      tmdbId,
                      catalogId: catId,
                      canvasBackground,
                      accent,
                      artworkUrl,
                      genre: effectiveGenre,
                      rating: effectiveRating,
                      showLogo
                    });

                    // Se il film/serie è rimasto alla stessa posizione, non lo rifare!
                    const existing = getCoverFilePath(coverKey);
                    if (existing) {
                      skippedCovers++;
                      continue;
                    }

                    try {
                      const pngBuffer = await createTopCover({
                        rank,
                        artworkUrl,
                        shape,
                        accent,
                        canvasBackground,
                        genre: effectiveGenre,
                        rating: effectiveRating,
                        catalogId: catId,
                        showLogo
                      });

                      saveCoverBuffer(coverKey, pngBuffer);
                      newCoversGenerated++;

                      // Throttle execution to avoid 100% CPU lockup
                      await sleep(35);
                    } catch (coverErr) {
                      console.warn(`[Preload] Errore generazione cover ${meta.name || tmdbId} #${rank}:`, coverErr.message);
                    }
                  }
                }
              }
            }
          } catch (itemErr) {
            console.warn(`[Preload] Errore elaborazione item ${meta.id}:`, itemErr.message);
          }
        }
      } catch (catErr) {
        console.warn(`[Preload] Errore caricamento catalogo ${catId}:`, catErr.message);
      }
    }

    // Cancella i rendering di film/serie che non sono più in classifica!
    const prunedCount = pruneStaleCovers(activeTuples, COVER_VERSION);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[Preload] Completato con successo in ${elapsed}s! ` +
      `Cataloghi: ${catalogCount}, Nuove cover: ${newCoversGenerated}, In cache (invariate): ${skippedCovers}, Rimosse non più in classifica: ${prunedCount}`
    );
  } catch (err) {
    console.error(`[Preload] Errore generale durante il preload:`, err.message);
  }
}

export function initScheduler(sourceManifestUrl) {
  // Esegui alle 09:00 e alle 18:00 ogni giorno
  // Cron syntax: "0 9,18 * * *" (minuto 0, ore 9 e 18, ogni giorno)
  cron.schedule("0 9,18 * * *", () => {
    const now = new Date().toLocaleTimeString();
    console.log(`[CRON] ${now} - Avvio aggiornamento programmato Top 10 (9:00 / 18:00)...`);
    preloadAllCatalogs(sourceManifestUrl);
  });

  console.log(`[Scheduler] Attivato aggiornamento automatico giornaliero alle 09:00 e alle 18:00.`);

  // Avvia il preload in background dopo 5 secondi dall'avvio
  setTimeout(() => {
    preloadAllCatalogs(sourceManifestUrl);
  }, 5000);
}
