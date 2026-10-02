const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMAGE = "https://image.tmdb.org/t/p";

const CACHE = {
  images: new Map(),
  find: new Map(),
  validation: new Map()
};

const TTL = {
  images: 6 * 60 * 60 * 1000,
  find: 24 * 60 * 60 * 1000,
  validation: 60 * 60 * 1000
};

function getCached(map, key) {
  const item = map.get(key);
  if (!item) return null;

  if (item.expiresAt <= Date.now()) {
    map.delete(key);
    return null;
  }

  return item.value;
}

function setCached(map, key, value, ttl, max = 1000) {
  map.set(key, {
    value,
    expiresAt: Date.now() + ttl
  });

  while (map.size > max) {
    const first = map.keys().next().value;
    if (!first) break;
    map.delete(first);
  }
}

async function tmdbFetch(path, apiKey) {
  if (!apiKey) throw new Error("TMDB API key mancante.");

  const sep = path.includes("?") ? "&" : "?";
  const url = `${TMDB_API}${path}${sep}api_key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": "blvckTOP/7.0"
    }
  });

  if (!response.ok) {
    throw new Error(`TMDB error ${response.status}`);
  }

  return response.json();
}

export async function validateTmdbKey(apiKey) {
  const key = apiKey.slice(0, 10);
  const cached = getCached(CACHE.validation, key);
  if (cached) return true;

  await tmdbFetch("/configuration", apiKey);
  setCached(CACHE.validation, key, true, TTL.validation, 100);
  return true;
}

export async function getTmdbImages(type, tmdbId, apiKey) {
  const mediaType = type === "series" || type === "tv" ? "tv" : "movie";
  const cacheKey = `${mediaType}:${tmdbId}`;

  const cached = getCached(CACHE.images, cacheKey);
  if (cached) return cached;

  const data = await tmdbFetch(
    `/${mediaType}/${encodeURIComponent(tmdbId)}/images?include_image_language=it,en,null`,
    apiKey
  );

  setCached(CACHE.images, cacheKey, data, TTL.images, 600);
  return data;
}

export async function resolveTmdbId(type, rawId, apiKey) {
  if (!rawId) return null;

  const id = String(rawId);

  if (id.startsWith("tmdb:")) {
    return id.split(":")[1] || null;
  }

  if (/^\d+$/.test(id)) {
    return id;
  }

  if (id.startsWith("tt")) {
    const wantsTv = type === "series" || type === "tv";
    const cacheKey = `${wantsTv ? "tv" : "movie"}:${id}`;

    const cached = getCached(CACHE.find, cacheKey);
    if (cached !== null) return cached;

    const data = await tmdbFetch(
      `/find/${encodeURIComponent(id)}?external_source=imdb_id`,
      apiKey
    );

    const list = wantsTv ? data.tv_results : data.movie_results;
    const result = list?.[0]?.id ? String(list[0].id) : null;

    setCached(CACHE.find, cacheKey, result, TTL.find, 1000);
    return result;
  }

  return null;
}

function scoreByLanguage(item) {
  if (item.iso_639_1 === "it") return 0;
  if (item.iso_639_1 === "en") return 1;
  if (item.iso_639_1 == null) return 2;
  return 3;
}

function sortImages(items) {
  return [...(items || [])]
    .filter(x => x.file_path)
    .sort((a, b) => {
      const lang = scoreByLanguage(a) - scoreByLanguage(b);
      if (lang !== 0) return lang;
      return (b.vote_average || 0) - (a.vote_average || 0);
    });
}

export function chooseBackdrop(images) {
  const items = sortImages(images.backdrops);

  return items.length
    ? `${TMDB_IMAGE}/w1280${items[0].file_path}`
    : null;
}

export function choosePoster(images) {
  const items = sortImages(images.posters);

  return items.length
    ? `${TMDB_IMAGE}/w780${items[0].file_path}`
    : null;
}

export function chooseLogo(images) {
  const items = sortImages(images.logos);

  return items.length
    ? `${TMDB_IMAGE}/w500${items[0].file_path}`
    : null;
}
