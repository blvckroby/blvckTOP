const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMAGE = "https://image.tmdb.org/t/p";

const CACHE = { images: new Map(), find: new Map(), validation: new Map() };
const TTL = {
  images: 6 * 60 * 60 * 1000,
  find: 24 * 60 * 60 * 1000,
  validation: 60 * 60 * 1000
};

function getCached(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { map.delete(key); return null; }
  return entry.value;
}

function setCached(map, key, value, ttl) {
  map.set(key, { value, expiresAt: Date.now() + ttl });
  if (map.size > 1000) {
    const firstKey = map.keys().next().value;
    if (firstKey) map.delete(firstKey);
  }
}

async function tmdbFetch(path, apiKey) {
  if (!apiKey) throw new Error("TMDB API key mancante.");
  const sep = path.includes("?") ? "&" : "?";
  const url = `${TMDB_API}${path}${sep}api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, { headers: { "User-Agent": "Nuvio-Top10-Custom-Covers/6.0" } });
  if (!response.ok) throw new Error(`TMDB error ${response.status}`);
  return response.json();
}

export async function validateTmdbKey(apiKey) {
  const cacheKey = apiKey.slice(0, 8);
  const cached = getCached(CACHE.validation, cacheKey);
  if (cached) return true;
  await tmdbFetch("/configuration", apiKey);
  setCached(CACHE.validation, cacheKey, true, TTL.validation);
  return true;
}

export async function getTmdbImages(type, tmdbId, apiKey) {
  const mediaType = type === "series" || type === "tv" ? "tv" : "movie";
  const cacheKey = `${mediaType}:${tmdbId}`;
  const cached = getCached(CACHE.images, cacheKey);
  if (cached) return cached;
  const data = await tmdbFetch(`/${mediaType}/${encodeURIComponent(tmdbId)}/images?include_image_language=it,en,null`, apiKey);
  setCached(CACHE.images, cacheKey, data, TTL.images);
  return data;
}

export async function resolveTmdbId(type, rawId, apiKey) {
  if (!rawId) return null;
  const id = String(rawId);
  if (id.startsWith("tmdb:")) return id.split(":")[1] || null;
  if (/^\d+$/.test(id)) return id;
  if (id.startsWith("tt")) {
    const wantsTv = type === "series" || type === "tv";
    const cacheKey = `${wantsTv ? "tv" : "movie"}:${id}`;
    const cached = getCached(CACHE.find, cacheKey);
    if (cached !== null) return cached;
    const data = await tmdbFetch(`/find/${encodeURIComponent(id)}?external_source=imdb_id`, apiKey);
    const list = wantsTv ? data.tv_results : data.movie_results;
    const result = list?.[0]?.id ? String(list[0].id) : null;
    setCached(CACHE.find, cacheKey, result, TTL.find);
    return result;
  }
  return null;
}

function languageScore(item) {
  if (item.iso_639_1 === "it") return 0;
  if (item.iso_639_1 === "en") return 1;
  if (item.iso_639_1 == null) return 2;
  return 3;
}

export function chooseBackdrop(images) {
  const items = [...(images.backdrops || [])].filter(x => x.file_path).sort((a,b) => {
    const lang = languageScore(a) - languageScore(b);
    if (lang !== 0) return lang;
    return (b.vote_average || 0) - (a.vote_average || 0);
  });
  return items.length ? `${TMDB_IMAGE}/w1280${items[0].file_path}` : null;
}

export function chooseLogo(images) {
  const items = [...(images.logos || [])].filter(x => x.file_path).sort((a,b) => {
    const lang = languageScore(a) - languageScore(b);
    if (lang !== 0) return lang;
    return (b.vote_average || 0) - (a.vote_average || 0);
  });
  return items.length ? `${TMDB_IMAGE}/w500${items[0].file_path}` : null;
}
