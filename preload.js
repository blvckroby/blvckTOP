import cron from "node-cron";
import {
  getCachedJson,
  setCachedJson,
  getCoverFilePath,
  saveCoverBuffer
} from "./db.js";
import {
  resolveTmdbId,
  getTmdbImages,
  chooseBackdrop,
  choosePoster,
  chooseLogo,
  DEFAULT_TMDB_KEY
} from "./tmdb.js";
import { createTopCover } from "./cover-generator.js";

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

export function computeCoverKey({
  rank,
  type,
  shape,
  tmdbId,
  catalogId,
  canvasBackground,
  accent,
  artworkUrl,
  logoUrl
}) {
  return [
    rank,
    type,
    shape,
    tmdbId || "",
    catalogId || "",
    canvasBackground || "transparent",
    accent || "#FFFFFF",
    artworkUrl || "",
    logoUrl || ""
  ].join("|");
}

export async function preloadAllCatalogs(sourceManifestUrl, options = {}) {
  if (!sourceManifestUrl) return;

  const startTime = Date.now();
  console.log(`[Preload] Inizio sincronizzazione e pre-caching Top 10...`);

  let newCoversGenerated = 0;
  let skippedCovers = 0;
  let catalogCount = 0;

  try {
    const manifestResponse = await fetch(sourceManifestUrl, {
      headers: { "User-Agent": "blvckTOP/7.2" }
    });

    if (!manifestResponse.ok) {
      throw new Error(`Manifest sorgente non raggiungibile (${manifestResponse.status})`);
    }

    const sourceManifest = await manifestResponse.json();
    setCachedJson(sourceManifestUrl, sourceManifest, 30 * 60 * 1000); // 30 min cache for manifest

    const catalogs = Array.isArray(sourceManifest.catalogs) ? sourceManifest.catalogs : [];
    catalogCount = catalogs.length;

    for (const cat of catalogs) {
      const type = cat.type;
      const catId = cat.id;
      const accent = catalogAccent(cat);

      const catalogUrl = `${sourceBaseUrl(sourceManifestUrl)}/catalog/${encodeURIComponent(type)}/${encodeURIComponent(catId)}.json`;

      try {
        const catRes = await fetch(catalogUrl, {
          headers: { "User-Agent": "blvckTOP/7.2" }
        });

        if (!catRes.ok) continue;

        const catData = await catRes.json();
        setCachedJson(catalogUrl, catData, 30 * 60 * 1000);

        const metas = Array.isArray(catData.metas) ? catData.metas : [];

        for (let i = 0; i < metas.length; i++) {
          const meta = metas[i];
          const rank = i + 1;

          try {
            const tmdbId = await resolveTmdbId(type, meta.id || meta.tmdbId, DEFAULT_TMDB_KEY);
            if (!tmdbId) continue;

            const images = await getTmdbImages(type, tmdbId, DEFAULT_TMDB_KEY);
            const logoUrl = chooseLogo(images);

            // Pre-generate for standard combinations
            const shapes = ["landscape", "poster"];
            const backgrounds = ["transparent", "black"];

            for (const shape of shapes) {
              const artworkUrl = shape === "poster"
                ? choosePoster(images)
                : chooseBackdrop(images);

              const itemLogoUrl = shape === "landscape" ? logoUrl : null;

              for (const canvasBackground of backgrounds) {
                const coverKey = computeCoverKey({
                  rank,
                  type: type === "series" ? "tv" : type,
                  shape,
                  tmdbId,
                  catalogId: catId,
                  canvasBackground,
                  accent,
                  artworkUrl,
                  logoUrl: itemLogoUrl
                });

                const existing = getCoverFilePath(coverKey);
                if (existing) {
                  skippedCovers++;
                  continue;
                }

                try {
                  const pngBuffer = await createTopCover({
                    rank,
                    artworkUrl,
                    logoUrl: itemLogoUrl,
                    shape,
                    accent,
                    canvasBackground
                  });

                  saveCoverBuffer(coverKey, pngBuffer);
                  newCoversGenerated++;
                } catch (coverErr) {
                  console.warn(`[Preload] Errore generazione cover ${meta.name || tmdbId} #${rank}:`, coverErr.message);
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

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[Preload] Completato con successo in ${elapsed}s! ` +
      `Cataloghi: ${catalogCount}, Nuove cover: ${newCoversGenerated}, In cache: ${skippedCovers}`
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
