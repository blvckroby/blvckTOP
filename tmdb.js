const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_IMAGE = "https://image.tmdb.org/t/p";

async function tmdbFetch(path, apiKey) {
  if (!apiKey) throw new Error("TMDB API key mancante.");

  const sep = path.includes("?") ? "&" : "?";
  const url = `${TMDB_API}${path}${sep}api_key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`TMDB error ${response.status}`);
  }
  return response.json();
}

export async function validateTmdbKey(apiKey) {
  await tmdbFetch("/configuration", apiKey);
  return true;
}

export async function getTmdbImages(type, tmdbId, apiKey) {
  const mediaType = type === "series" || type === "tv" ? "tv" : "movie";
  return tmdbFetch(
    `/${mediaType}/${encodeURIComponent(tmdbId)}/images?include_image_language=it,en,null`,
    apiKey
  );
}

export async function resolveTmdbId(type, rawId, apiKey) {
  if (!rawId) return null;
  const id = String(rawId);

  if (id.startsWith("tmdb:")) {
    return id.split(":")[1] || null;
  }

  if (/^\d+$/.test(id)) return id;

  if (id.startsWith("tt")) {
    const data = await tmdbFetch(
      `/find/${encodeURIComponent(id)}?external_source=imdb_id`,
      apiKey
    );

    const wantsTv = type === "series" || type === "tv";
    const list = wantsTv ? data.tv_results : data.movie_results;
    return list?.[0]?.id ? String(list[0].id) : null;
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
  const items = [...(images.backdrops || [])]
    .filter(x => x.file_path)
    .sort((a, b) => {
      const lang = languageScore(a) - languageScore(b);
      if (lang !== 0) return lang;
      return (b.vote_average || 0) - (a.vote_average || 0);
    });

  return items.length
    ? `${TMDB_IMAGE}/original${items[0].file_path}`
    : null;
}

export function chooseLogo(images) {
  const items = [...(images.logos || [])]
    .filter(x => x.file_path)
    .sort((a, b) => {
      const lang = languageScore(a) - languageScore(b);
      if (lang !== 0) return lang;
      return (b.vote_average || 0) - (a.vote_average || 0);
    });

  return items.length
    ? `${TMDB_IMAGE}/w500${items[0].file_path}`
    : null;
}
