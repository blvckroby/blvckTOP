import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { encryptConfig, decryptConfig, shortConfigId } from "./config-token.js";
import {
  validateTmdbKey,
  getTmdbImages,
  chooseBackdrop,
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

function sourceBaseUrl() {
  return SOURCE_MANIFEST_URL.replace(/\/manifest\.json(?:\?.*)?$/i, "");
}

function publicBase(req) {
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  return `${proto}://${req.get("host")}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Nuvio-Top10-Custom-Covers/5.0" }
  });

  if (!response.ok) {
    throw new Error(`Sorgente HTTP ${response.status}`);
  }

  return response.json();
}

function catalogKey(type, id) {
  return `${type}::${id}`;
}

function selectedCatalogSet(config) {
  return new Set(config.catalogs.map(c => catalogKey(c.type, c.id)));
}

async function buildCoverUrl(req, token, meta, rank, type, apiKey) {
  try {
    const tmdbId = await resolveTmdbId(type, meta.id || meta.tmdbId, apiKey);

    if (tmdbId) {
      const qs = new URLSearchParams({
        rank: String(rank),
        type: type === "series" ? "tv" : type,
        tmdbId
      });
      return `${publicBase(req)}/c/${token}/top-cover?${qs}`;
    }
  } catch (err) {
    console.warn(`TMDB resolve fallito per ${meta.id}:`, err.message);
  }

  const artwork = meta.background || meta.poster;
  if (!artwork) return meta.poster;

  const qs = new URLSearchParams({
    rank: String(rank),
    artwork
  });

  return `${publicBase(req)}/c/${token}/top-cover?${qs}`;
}

/* -------- Configuratore pubblico -------- */

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
    res.status(502).json({ error: "Impossibile caricare i cataloghi." });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    const tmdbApiKey = String(req.body?.tmdbApiKey || "").trim();
    const requested = Array.isArray(req.body?.catalogs) ? req.body.catalogs : [];

    if (!tmdbApiKey) {
      return res.status(400).json({ error: "Inserisci la TMDB API key." });
    }

    if (!requested.length) {
      return res.status(400).json({ error: "Seleziona almeno un catalogo." });
    }

    await validateTmdbKey(tmdbApiKey);

    const source = await fetchJson(SOURCE_MANIFEST_URL);
    const available = new Map(
      (source.catalogs || []).map(c => [catalogKey(c.type, c.id), c])
    );

    const catalogs = requested
      .map(c => available.get(catalogKey(c.type, c.id)))
      .filter(Boolean)
      .map(c => ({
        id: c.id,
        type: c.type,
        name: c.name || c.id
      }));

    if (!catalogs.length) {
      return res.status(400).json({ error: "Cataloghi non validi." });
    }

    const token = encryptConfig({
      v: 1,
      tmdbApiKey,
      catalogs
    });

    const manifestUrl = `${publicBase(req)}/c/${token}/manifest.json`;

    res.json({
      ok: true,
      manifestUrl,
      catalogCount: catalogs.length
    });
  } catch (err) {
    console.error(err);
    const message = String(err.message || "");

    if (message.includes("TMDB error 401")) {
      return res.status(400).json({ error: "TMDB API key non valida." });
    }

    res.status(500).json({
      error: "Impossibile generare il manifest."
    });
  }
});

/* -------- Addon personalizzato -------- */

app.get("/c/:token/manifest.json", async (req, res) => {
  try {
    const config = decryptConfig(req.params.token);
    const source = await fetchJson(SOURCE_MANIFEST_URL);
    const selected = selectedCatalogSet(config);

    const catalogs = (source.catalogs || []).filter(c =>
      selected.has(catalogKey(c.type, c.id))
    );

    const idSuffix = shortConfigId(req.params.token);

    const manifest = {
      ...source,
      id: `com.custom.top10.${idSuffix}`,
      version: "1.0.0",
      name: "Top 10 • Custom Covers",
      description: "Top 10 personalizzate con cover landscape",
      catalogs,
      resources: Array.from(
        new Set([...(source.resources || []), "catalog", "meta"])
      )
    };

    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(manifest);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/c/:token/catalog/:type/:catalogId.json", async (req, res) => {
  try {
    const config = decryptConfig(req.params.token);
    const { type, catalogId } = req.params;

    if (!selectedCatalogSet(config).has(catalogKey(type, catalogId))) {
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
          config.tmdbApiKey
        ),
        posterShape: "landscape"
      }))
    );

    res.setHeader("Cache-Control", "public, max-age=300");
    res.json({ ...data, metas: decorated });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message, metas: [] });
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
    res.status(502).json({ error: err.message });
  }
});

app.get("/c/:token/top-cover", async (req, res) => {
  try {
    const config = decryptConfig(req.params.token);

    const rank = Math.max(1, Math.min(99, Number(req.query.rank || 1)));
    const type = String(req.query.type || "movie");
    const tmdbId = req.query.tmdbId ? String(req.query.tmdbId) : null;

    let artworkUrl = req.query.artwork ? String(req.query.artwork) : null;
    let logoUrl = req.query.logo ? String(req.query.logo) : null;

    if (tmdbId && (!artworkUrl || !logoUrl)) {
      const images = await getTmdbImages(
        type,
        tmdbId,
        config.tmdbApiKey
      );

      if (!artworkUrl) artworkUrl = chooseBackdrop(images);
      if (!logoUrl) logoUrl = chooseLogo(images);
    }

    if (!artworkUrl) {
      return res.status(400).json({ error: "Nessun backdrop disponibile." });
    }

    const png = await createTopCover({
      rank,
      artworkUrl,
      logoUrl
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(png);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message || "Errore generazione cover"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Nuvio Top 10 configurator: http://localhost:${PORT}`);
});
