import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  encryptConfig,
  decryptConfig,
  shortConfigId
} from "./config-token.js";

import {
  validateTmdbKey,
  getTmdbImages,
  chooseBackdrop,
  choosePoster,
  chooseLogo,
  resolveTmdbId
} from "./tmdb.js";

import { createTopCover } from "./cover-generator.js";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SOURCE_MANIFEST_URL = process.env.SOURCE_MANIFEST_URL;

if (!SOURCE_MANIFEST_URL) {
  throw new Error("SOURCE_MANIFEST_URL non configurato.");
}

if (!process.env.APP_SECRET || process.env.APP_SECRET.length < 24) {
  throw new Error("APP_SECRET non configurato o troppo corto.");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("trust proxy", true);
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

const jsonCache = new Map();
const coverCache = new Map();
const pendingCovers = new Map();

const JSON_TTL = 5 * 60 * 1000;
const COVER_TTL = 24 * 60 * 60 * 1000;
const MAX_COVER_CACHE = 160;

function getMemoryCache(map, key) {
  const item = map.get(key);
  if (!item) return null;

  if (item.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }

  return item.value;
}

function setMemoryCache(map, key, value, ttl, maxItems = 500) {
  map.set(key, {
    value,
    expiresAt: Date.now() + ttl
  });

  while (map.size > maxItems) {
    const first = map.keys().next().value;
    if (!first) break;
    map.delete(first);
  }
}

function sourceBaseUrl() {
  return SOURCE_MANIFEST_URL.replace(/\/manifest\.json(?:\?.*)?$/i, "");
}

function publicBase(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}`;
}

async function fetchJson(url) {
  const cached = getMemoryCache(jsonCache, url);
  if (cached) return cached;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "blvckTOP/7.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Sorgente HTTP ${response.status}`);
  }

  const data = await response.json();
  setMemoryCache(jsonCache, url, data, JSON_TTL, 300);
  return data;
}

function catalogKey(type, id) {
  return `${type}::${id}`;
}

function selectedCatalogSet(config) {
  return new Set(
    config.catalogs.map(c => catalogKey(c.type, c.id))
  );
}

function normalizeShape(shape) {
  return shape === "poster" || shape === "portrait"
    ? "poster"
    : "landscape";
}

function getCatalogConfig(config, type, id) {
  return config.catalogs.find(
    c => c.type === type && c.id === id
  ) || null;
}

function catalogAccent(catalog = {}) {
  const key = `${catalog.id || ""} ${catalog.name || ""}`.toLowerCase();

  if (key.includes("netflix")) return "#E50914";
  if (key.includes("prime")) return "#00A8E1";
  if (key.includes("amazon")) return "#00A8E1";
  if (key.includes("disney")) return "#2D7DFF";
  if (key.includes("apple")) return "#D8DFEA";
  if (key.includes("now")) return "#00CFFF";
  if (key.includes("paramount")) return "#0064FF";
  if (key.includes("raiplay") || key.includes("rai")) return "#1C6DFF";
  if (key.includes("rakuten")) return "#BF0000";
  if (key.includes("chili")) return "#FF5A1F";
  if (key.includes("max") || key.includes("hbo")) return "#7D57FF";

  return "#8C75FF";
}

async function buildCoverUrl(
  req,
  token,
  meta,
  rank,
  type,
  apiKey,
  catalog
) {
  const shape = normalizeShape(catalog.shape);

  try {
    const tmdbId = await resolveTmdbId(
      type,
      meta.id || meta.tmdbId,
      apiKey
    );

    if (tmdbId) {
      const qs = new URLSearchParams({
        rank: String(rank),
        type: type === "series" ? "tv" : type,
        tmdbId,
        shape,
        catalogId: catalog.id
      });

      return `${publicBase(req)}/c/${token}/top-cover?${qs}`;
    }
  } catch (err) {
    console.warn(`TMDB resolve fallito per ${meta.id}:`, err.message);
  }

  const fallbackArtwork = shape === "poster"
    ? (meta.poster || meta.background)
    : (meta.background || meta.poster);

  if (!fallbackArtwork) return meta.poster;

  const qs = new URLSearchParams({
    rank: String(rank),
    artwork: fallbackArtwork,
    shape,
    catalogId: catalog.id
  });

  return `${publicBase(req)}/c/${token}/top-cover?${qs}`;
}

/* ---------------- Public configurator ---------------- */

app.get("/api/catalogs", async (_req, res) => {
  try {
    const source = await fetchJson(SOURCE_MANIFEST_URL);

    const catalogs = (source.catalogs || []).map(c => ({
      id: c.id,
      type: c.type,
      name: c.name || c.id
    }));

    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ catalogs });
  } catch (err) {
    console.error(err);
    res.status(502).json({
      error: "Impossibile caricare i cataloghi."
    });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    const tmdbApiKey = String(req.body?.tmdbApiKey || "").trim();
    const requested = Array.isArray(req.body?.catalogs)
      ? req.body.catalogs
      : [];

    if (!tmdbApiKey) {
      return res.status(400).json({
        error: "Inserisci la TMDB API key."
      });
    }

    if (!requested.length) {
      return res.status(400).json({
        error: "Seleziona almeno un catalogo."
      });
    }

    await validateTmdbKey(tmdbApiKey);

    const source = await fetchJson(SOURCE_MANIFEST_URL);

    const available = new Map(
      (source.catalogs || []).map(c => [
        catalogKey(c.type, c.id),
        c
      ])
    );

    const catalogs = requested
      .map(requestedCatalog => {
        const sourceCatalog = available.get(
          catalogKey(requestedCatalog.type, requestedCatalog.id)
        );

        if (!sourceCatalog) return null;

        return {
          id: sourceCatalog.id,
          type: sourceCatalog.type,
          name: sourceCatalog.name || sourceCatalog.id,
          shape: normalizeShape(requestedCatalog.shape)
        };
      })
      .filter(Boolean);

    if (!catalogs.length) {
      return res.status(400).json({
        error: "Cataloghi non validi."
      });
    }

    const token = encryptConfig({
      v: 2,
      tmdbApiKey,
      catalogs
    });

    const manifestUrl =
      `${publicBase(req)}/c/${token}/manifest.json`;

    res.json({
      ok: true,
      manifestUrl,
      catalogCount: catalogs.length
    });
  } catch (err) {
    console.error(err);

    if (String(err.message || "").includes("TMDB error 401")) {
      return res.status(400).json({
        error: "TMDB API key non valida."
      });
    }

    res.status(500).json({
      error: "Impossibile generare il manifest."
    });
  }
});

/* ---------------- Generated addon ---------------- */

app.get("/c/:token/manifest.json", async (req, res) => {
  try {
    const config = decryptConfig(req.params.token);
    const source = await fetchJson(SOURCE_MANIFEST_URL);
    const selected = selectedCatalogSet(config);

    const catalogs = (source.catalogs || [])
      .filter(c => selected.has(catalogKey(c.type, c.id)))
      .map(c => {
        const conf = getCatalogConfig(config, c.type, c.id);

        // Keep the source catalog clean: custom shape is used server-side.
        return {
          ...c,
          name: c.name || conf?.name || c.id
        };
      });

    const idSuffix = shortConfigId(req.params.token);

    const manifest = {
      ...source,
      id: `com.blvcktop.${idSuffix}`,
      version: "2.0.0",
      name: "blvckTOP",
      description: "Top 10 personalizzate con cover numerate",
      logo: "https://tudumext.com/projects/top-10/Top10Badge.svg",
      catalogs,
      resources: Array.from(
        new Set([...(source.resources || []), "catalog", "meta"])
      )
    };

    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(manifest);
  } catch (err) {
    res.status(400).json({
      error: err.message
    });
  }
});

app.get("/c/:token/catalog/:type/:catalogId.json", async (req, res) => {
  try {
    const config = decryptConfig(req.params.token);
    const { type, catalogId } = req.params;

    const catalog = getCatalogConfig(config, type, catalogId);

    if (!catalog) {
      return res.status(404).json({ metas: [] });
    }

    const query = req.url.includes("?")
      ? req.url.slice(req.url.indexOf("?"))
      : "";

    const sourceUrl =
      `${sourceBaseUrl()}/catalog/${encodeURIComponent(type)}/` +
      `${encodeURIComponent(catalogId)}.json${query}`;

    const data = await fetchJson(sourceUrl);
    const metas = Array.isArray(data.metas) ? data.metas : [];

    const decorated = await Promise.all(
      metas.map(async (meta, index) => ({
        ...meta,
        poster: await buildCoverUrl(
          req,
          req.params.token,
          meta,
          index + 1,
          type,
          config.tmdbApiKey,
          catalog
        ),
        posterShape:
          normalizeShape(catalog.shape) === "poster"
            ? "poster"
            : "landscape"
      }))
    );

    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({
      ...data,
      metas: decorated
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({
      error: err.message,
      metas: []
    });
  }
});

app.get("/c/:token/meta/:type/:id.json", async (req, res) => {
  try {
    decryptConfig(req.params.token);

    const url =
      `${sourceBaseUrl()}/meta/${encodeURIComponent(req.params.type)}/` +
      `${encodeURIComponent(req.params.id)}.json`;

    const data = await fetchJson(url);

    res.setHeader("Cache-Control", "public, max-age=1800");
    res.json(data);
  } catch (err) {
    res.status(502).json({
      error: err.message
    });
  }
});

app.get("/c/:token/top-cover", async (req, res) => {
  try {
    const config = decryptConfig(req.params.token);

    const rank = Math.max(
      1,
      Math.min(99, Number(req.query.rank || 1))
    );

    const type = String(req.query.type || "movie");
    const shape = normalizeShape(String(req.query.shape || "landscape"));
    const tmdbId = req.query.tmdbId
      ? String(req.query.tmdbId)
      : null;

    const catalogId = req.query.catalogId
      ? String(req.query.catalogId)
      : "";

    let artworkUrl = req.query.artwork
      ? String(req.query.artwork)
      : null;

    let logoUrl = req.query.logo
      ? String(req.query.logo)
      : null;

    const catalog =
      config.catalogs.find(c => c.id === catalogId) || {};

    const accent = catalogAccent(catalog);

    const coverKey = [
      req.params.token,
      rank,
      type,
      shape,
      tmdbId || "",
      catalogId,
      artworkUrl || "",
      logoUrl || ""
    ].join("|");

    const cached = getMemoryCache(coverCache, coverKey);

    if (cached) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader(
        "Cache-Control",
        "public, max-age=86400, immutable"
      );
      res.setHeader("X-Cover-Cache", "HIT");
      return res.send(cached);
    }

    if (pendingCovers.has(coverKey)) {
      const png = await pendingCovers.get(coverKey);

      res.setHeader("Content-Type", "image/png");
      res.setHeader(
        "Cache-Control",
        "public, max-age=86400, immutable"
      );
      res.setHeader("X-Cover-Cache", "SHARED");
      return res.send(png);
    }

    const generation = (async () => {
      if (tmdbId && !artworkUrl) {
        const images = await getTmdbImages(
          type,
          tmdbId,
          config.tmdbApiKey
        );

        artworkUrl = shape === "poster"
          ? choosePoster(images)
          : chooseBackdrop(images);

        if (!logoUrl) {
          logoUrl = chooseLogo(images);
        }
      } else if (tmdbId && !logoUrl) {
        const images = await getTmdbImages(
          type,
          tmdbId,
          config.tmdbApiKey
        );

        logoUrl = chooseLogo(images);
      }

      if (!artworkUrl) {
        throw new Error("Nessuna immagine disponibile.");
      }

      const png = await createTopCover({
        rank,
        artworkUrl,
        logoUrl,
        shape,
        accent
      });

      setMemoryCache(
        coverCache,
        coverKey,
        png,
        COVER_TTL,
        MAX_COVER_CACHE
      );

      return png;
    })();

    pendingCovers.set(coverKey, generation);

    try {
      const png = await generation;

      res.setHeader("Content-Type", "image/png");
      res.setHeader(
        "Cache-Control",
        "public, max-age=86400, immutable"
      );
      res.setHeader("X-Cover-Cache", "MISS");
      res.send(png);
    } finally {
      pendingCovers.delete(coverKey);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message || "Errore generazione cover"
    });
  }
});

app.listen(PORT, () => {
  console.log(`blvckTOP configurator: http://localhost:${PORT}`);
});
