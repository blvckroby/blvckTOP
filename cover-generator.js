import sharp from "sharp";
import { getAssetBuffer, saveAssetBuffer } from "./db.js";

const pendingDownloads = new Map();

const LAYOUTS = {
  landscape: {
    canvas: { width: 1280, height: 720 },
    card: {
      x: 300,
      y: 107,
      width: 900,
      height: 506,
      radius: 30
    },
    number: {
      xSingle: 62,
      xDouble: 24,
      sizeSingle: 450,
      sizeDouble: 370,
      opticalDrop: 8
    },
    logo: {
      maxWidth: 380,
      maxHeight: 155,
      left: 46,
      bottom: 40
    }
  },

  poster: {
    canvas: { width: 1000, height: 1500 },
    card: {
      x: 210,
      y: 165,
      width: 730,
      height: 1095,
      radius: 38
    },
    number: {
      xSingle: 14,
      xDouble: -10,
      sizeSingle: 405,
      sizeDouble: 335,
      opticalDrop: 22
    },
    logo: {
      maxWidth: 350,
      maxHeight: 145,
      left: 40,
      bottom: 42
    }
  }
};

export function normalizedShape(shape) {
  return shape === "poster" || shape === "portrait"
    ? "poster"
    : "landscape";
}

async function fetchBuffer(url) {
  // 1. Check persistent disk cache first
  const diskCached = getAssetBuffer(url);
  if (diskCached) return diskCached;

  // 2. Check pending parallel downloads
  if (pendingDownloads.has(url)) {
    return pendingDownloads.get(url);
  }

  const promise = (async () => {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "blvckTOP/7.2"
      }
    });

    if (!response.ok) {
      throw new Error(`Download immagine fallito (${response.status}) da ${url}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    saveAssetBuffer(url, buffer);
    return buffer;
  })();

  pendingDownloads.set(url, promise);

  try {
    return await promise;
  } finally {
    pendingDownloads.delete(url);
  }
}

function hexToRgb(hex) {
  const clean = String(hex || "#ffffff").replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map(x => x + x).join("")
    : clean.padEnd(6, "f").slice(0, 6);

  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function escapeXml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatRating(raw) {
  if (!raw) return "";
  const num = parseFloat(String(raw).replace(",", "."));
  if (isNaN(num) || num <= 0) return "";
  return num.toFixed(1);
}

function cleanGenre(raw) {
  if (!raw) return "";
  let g = String(raw).trim();
  if (g.includes(",")) g = g.split(",")[0].trim();
  if (g.includes("/")) g = g.split("/")[0].trim();
  return g.toUpperCase();
}

function generateGlassBackground(width, height, isStremio = true) {
  if (!isStremio) {
    return Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="#000000"/>
      </svg>
    `);
  }

  // Stremio 3D Liquid Glass container
  const pad = 12;
  const rw = width - pad * 2;
  const rh = height - pad * 2;
  const rx = Math.round(width * 0.032);

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Stremio deep atmosphere gradient (darker to lighter to deep purple) -->
        <radialGradient id="stremioAtmosphere" cx="50%" cy="32%" r="65%">
          <stop offset="0%" stop-color="#2a235c"/>
          <stop offset="45%" stop-color="#1d1945"/>
          <stop offset="100%" stop-color="#120f2e"/>
        </radialGradient>

        <!-- Liquid Glass Fill: Translucent frosted depth with light refraction -->
        <linearGradient id="glassBodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.10"/>
          <stop offset="35%" stop-color="#FFFFFF" stop-opacity="0.03"/>
          <stop offset="70%" stop-color="#1A153E" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#0F0C24" stop-opacity="0.55"/>
        </linearGradient>

        <!-- 3D Liquid Glass Specular Border: Bright light on top/left, soft refractive rim on bottom -->
        <linearGradient id="glassStrokeGrad" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.55"/>
          <stop offset="25%" stop-color="#A5B4FC" stop-opacity="0.30"/>
          <stop offset="55%" stop-color="#818CF8" stop-opacity="0.12"/>
          <stop offset="85%" stop-color="#FFFFFF" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="#4F46E5" stop-opacity="0.35"/>
        </linearGradient>

        <!-- Inner Glass Specular Bevel (Top Light Highlight) -->
        <linearGradient id="topLightSheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.45"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>

        <!-- Outer Glass Drop Shadow -->
        <filter id="glassShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#070614" flood-opacity="0.75"/>
        </filter>
      </defs>

      <!-- Base Stremio canvas background -->
      <rect width="${width}" height="${height}" fill="url(#stremioAtmosphere)"/>

      <!-- Liquid Glass Elevated Card Container -->
      <g filter="url(#glassShadow)">
        <rect
          x="${pad}"
          y="${pad}"
          width="${rw}"
          height="${rh}"
          rx="${rx}"
          ry="${rx}"
          fill="url(#glassBodyGrad)"
          stroke="url(#glassStrokeGrad)"
          stroke-width="2.5"
        />
      </g>

      <!-- Glass Top Specular Lip (3D Curved Highlight) -->
      <path
        d="M ${pad + rx + 10} ${pad + 2} Q ${width / 2} ${pad + 1} ${width - pad - rx - 10} ${pad + 2}"
        stroke="url(#topLightSheen)"
        stroke-width="2"
        stroke-linecap="round"
        fill="none"
      />
    </svg>
  `);
}

function numberSvg(rank, layout, accent, genre = "", rating = "") {
  const { canvas, card, number } = layout;
  const isDouble = String(rank).length > 1;
  const fontSize = isDouble ? number.sizeDouble : number.sizeSingle;
  const x = isDouble ? number.xDouble : number.xSingle;

  const centerY = card.y + card.height / 2;
  const y = centerY + fontSize * 0.34 + number.opticalDrop;

  const strokeWidth = layout === LAYOUTS.poster ? 10 : 11;

  const escapedGenre = escapeXml(cleanGenre(genre));
  const ratingVal = formatRating(rating);

  let metaXml = "";

  if (layout === LAYOUTS.landscape) {
    // Exact center of whole canvas background (0..1280) -> metaX = 640, in bottom space -> metaY = 668
    const metaX = 640;
    const metaY = 668;

    if (escapedGenre && ratingVal) {
      const gSize = escapedGenre.length > 14 ? 32 : (escapedGenre.length > 10 ? 36 : 40);
      metaXml = `
        <text x="${metaX}" y="${metaY}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif" filter="url(#metaShadow)">
          <tspan fill="#F1F5F9" font-size="${gSize}" font-weight="900" letter-spacing="2.5">${escapedGenre}</tspan>
          <tspan fill="#94A3B8" font-size="30" font-weight="800">   •   </tspan>
          <tspan fill="#FFB800" font-size="46" font-weight="900">★ </tspan>
          <tspan fill="#FFFFFF" font-size="46" font-weight="900">${ratingVal}</tspan>
        </text>
      `;
    } else if (escapedGenre) {
      metaXml = `<text x="${metaX}" y="${metaY}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="40" font-weight="900" letter-spacing="2.5" fill="#F1F5F9" filter="url(#metaShadow)">${escapedGenre}</text>`;
    } else if (ratingVal) {
      metaXml = `<text x="${metaX}" y="${metaY}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="46" font-weight="900" filter="url(#metaShadow)"><tspan fill="#FFB800">★ </tspan><tspan fill="#FFFFFF">${ratingVal}</tspan></text>`;
    }
  } else {
    // Poster / Portrait
    // Exact center of whole canvas background (0..1000) -> metaX = 500, in bottom space (1260..1500) -> metaY = 1380
    const metaX = 500;
    const metaY = 1380;

    if (escapedGenre && ratingVal) {
      const gSize = escapedGenre.length > 14 ? 44 : (escapedGenre.length > 10 ? 48 : 52);
      metaXml = `
        <text x="${metaX}" y="${metaY}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif" filter="url(#metaShadow)">
          <tspan fill="#F1F5F9" font-size="${gSize}" font-weight="900" letter-spacing="3">${escapedGenre}</tspan>
          <tspan fill="#94A3B8" font-size="38" font-weight="800">   •   </tspan>
          <tspan fill="#FFB800" font-size="64" font-weight="900">★ </tspan>
          <tspan fill="#FFFFFF" font-size="64" font-weight="900">${ratingVal}</tspan>
        </text>
      `;
    } else if (escapedGenre) {
      metaXml = `<text x="${metaX}" y="${metaY}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="52" font-weight="900" letter-spacing="3" fill="#F1F5F9" filter="url(#metaShadow)">${escapedGenre}</text>`;
    } else if (ratingVal) {
      metaXml = `<text x="${metaX}" y="${metaY}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="64" font-weight="900" filter="url(#metaShadow)"><tspan fill="#FFB800">★ </tspan><tspan fill="#FFFFFF">${ratingVal}</tspan></text>`;
    }
  }

  return Buffer.from(`
    <svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="strokeGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity=".98"/>
          <stop offset="48%" stop-color="#F1F2F4" stop-opacity=".94"/>
          <stop offset="100%" stop-color="#C9CDD3" stop-opacity=".86"/>
        </linearGradient>

        <filter id="brandGlow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="30" result="bigBlur"/>
          <feFlood flood-color="${accent}" flood-opacity=".72" result="brandColor"/>
          <feComposite in="brandColor" in2="bigBlur" operator="in" result="bigGlow"/>

          <feGaussianBlur in="SourceAlpha" stdDeviation="11" result="midBlur"/>
          <feFlood flood-color="${accent}" flood-opacity=".52" result="midColor"/>
          <feComposite in="midColor" in2="midBlur" operator="in" result="midGlow"/>

          <feMerge>
            <feMergeNode in="bigGlow"/>
            <feMergeNode in="midGlow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <filter id="metaShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.95"/>
        </filter>
      </defs>

      <text
        x="${x}"
        y="${y}"
        font-family="Inter, Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="800"
        letter-spacing="-16"
        fill="none"
        stroke="url(#strokeGrad)"
        stroke-width="${strokeWidth}"
        stroke-linejoin="round"
        paint-order="stroke"
        filter="url(#brandGlow)"
      >${rank}</text>

      ${metaXml}
    </svg>
  `);
}

async function roundedArtwork(buffer, layout) {
  const { card } = layout;

  const resized = await sharp(buffer)
    .resize(card.width, card.height, {
      fit: "cover",
      position: "centre"
    })
    .png()
    .toBuffer();

  const mask = Buffer.from(`
    <svg width="${card.width}" height="${card.height}" xmlns="http://www.w3.org/2000/svg">
      <rect
        width="100%"
        height="100%"
        rx="${card.radius}"
        ry="${card.radius}"
        fill="#fff"
      />
    </svg>
  `);

  return sharp(resized)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function cardShadow(layout) {
  const { card } = layout;

  const svg = Buffer.from(`
    <svg width="${card.width + 120}" height="${card.height + 120}" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="60"
        y="46"
        width="${card.width}"
        height="${card.height}"
        rx="${card.radius}"
        ry="${card.radius}"
        fill="#000"
        fill-opacity=".52"
      />
    </svg>
  `);

  return sharp(svg)
    .blur(24)
    .png()
    .toBuffer();
}

async function prepareLogo(buffer, layout) {
  const { logo: conf } = layout;

  const meta = await sharp(buffer).metadata();

  let width = meta.width || conf.maxWidth;
  let height = meta.height || conf.maxHeight;

  const scale = Math.min(
    conf.maxWidth / width,
    conf.maxHeight / height,
    1
  );

  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const logo = await sharp(buffer)
    .resize({
      width,
      height,
      fit: "inside",
      withoutEnlargement: true
    })
    .png()
    .toBuffer();

  const pad = 32;
  const outWidth = width + pad * 2;
  const outHeight = height + pad * 2;

  const alpha = await sharp(logo)
    .ensureAlpha()
    .extractChannel("alpha")
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .blur(10)
    .toBuffer();

  const shadow = await sharp({
    create: {
      width: outWidth,
      height: outHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.58 }
    }
  })
    .composite([{ input: alpha, blend: "dest-in" }])
    .png()
    .toBuffer();

  const composed = await sharp({
    create: {
      width: outWidth,
      height: outHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      { input: shadow, left: 0, top: 6 },
      { input: logo, left: pad, top: pad }
    ])
    .png()
    .toBuffer();

  return {
    buffer: composed,
    visibleWidth: width,
    visibleHeight: height,
    pad
  };
}

async function brandAmbientGlow(layout, accent) {
  const { canvas, card } = layout;
  const rgb = hexToRgb(accent);

  const glowWidth = Math.min(canvas.width, card.x + 140);
  const glowHeight = Math.min(canvas.height, card.height + 260);

  const svg = Buffer.from(`
    <svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="ambient" cx="34%" cy="52%" r="45%">
          <stop offset="0%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity=".20"/>
          <stop offset="45%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity=".07"/>
          <stop offset="100%" stop-color="rgb(${rgb.r},${rgb.g},${rgb.b})" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${glowWidth}" height="${glowHeight}" fill="url(#ambient)"/>
    </svg>
  `);

  return sharp(svg)
    .blur(10)
    .png()
    .toBuffer();
}

export function parseBackgroundColor(canvasBackground) {
  const bg = String(canvasBackground || "").toLowerCase().trim();
  if (!bg || bg === "transparent") {
    return { r: 0, g: 0, b: 0, alpha: 0 };
  }
  if (bg === "stremio" || bg === "stremio-navy" || bg === "rgb(26,23,62)" || bg === "rgb(26, 23, 62)" || bg === "#1a173e" || bg === "1a173e") {
    return { r: 26, g: 23, b: 62, alpha: 1 };
  }
  if (bg === "black" || bg === "nero") {
    return { r: 0, g: 0, b: 0, alpha: 1 };
  }
  if (bg.startsWith("#")) {
    const rgb = hexToRgb(bg);
    return { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 1 };
  }
  return { r: 0, g: 0, b: 0, alpha: 0 };
}

export async function createTopCover({
  rank,
  artworkUrl,
  shape = "landscape",
  accent = "#FFFFFF",
  canvasBackground = "transparent",
  genre = "",
  rating = ""
}) {
  if (!artworkUrl) throw new Error("artworkUrl mancante.");

  const normalized = normalizedShape(shape);
  const layout = LAYOUTS[normalized];

  const artworkBuffer = await fetchBuffer(artworkUrl);

  const [art, shadow, ambient] = await Promise.all([
    roundedArtwork(artworkBuffer, layout),
    cardShadow(layout),
    brandAmbientGlow(layout, accent)
  ]);

  const { canvas, card } = layout;

  const composites = [
    // Soft brand tint around the number area.
    { input: ambient, left: 0, top: 0 },

    // Number and metadata go behind the card.
    { input: numberSvg(rank, layout, accent, genre, rating), left: 0, top: 0 },

    // Card shadow.
    {
      input: shadow,
      left: card.x - 60,
      top: card.y - 46 + 16
    },

    // Backdrop/poster.
    {
      input: art,
      left: card.x,
      top: card.y
    }
  ];

  const bgLower = String(canvasBackground || "").toLowerCase().trim();
  const isStremio = bgLower === "stremio" || bgLower === "stremio-navy" || bgLower === "rgb(26,23,62)" || bgLower === "rgb(26, 23, 62)" || bgLower === "#1a173e" || bgLower === "1a173e";

  let baseSharp;
  if (isStremio) {
    baseSharp = sharp(generateGlassBackground(canvas.width, canvas.height, true));
  } else {
    baseSharp = sharp({
      create: {
        width: canvas.width,
        height: canvas.height,
        channels: 4,
        background: parseBackgroundColor(canvasBackground)
      }
    });
  }

  return baseSharp
    .composite(composites)
    .png({
      compressionLevel: 8,
      adaptiveFiltering: true
    })
    .toBuffer();
}
