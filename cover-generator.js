import sharp from "sharp";

const IMAGE_CACHE_TTL = 6 * 60 * 60 * 1000;
const MAX_IMAGE_CACHE = 100;

const imageCache = new Map();
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
      x: 235,
      y: 190,
      width: 680,
      height: 1020,
      radius: 36
    },
    number: {
      xSingle: 28,
      xDouble: 4,
      sizeSingle: 330,
      sizeDouble: 270,
      opticalDrop: 14
    },
    logo: {
      maxWidth: 350,
      maxHeight: 145,
      left: 40,
      bottom: 42
    }
  }
};

function normalizedShape(shape) {
  return shape === "poster" || shape === "portrait"
    ? "poster"
    : "landscape";
}

function getImageFromCache(url) {
  const item = imageCache.get(url);
  if (!item) return null;

  if (item.expiresAt <= Date.now()) {
    imageCache.delete(url);
    return null;
  }

  return item.buffer;
}

function setImageCache(url, buffer) {
  imageCache.set(url, {
    buffer,
    expiresAt: Date.now() + IMAGE_CACHE_TTL
  });

  while (imageCache.size > MAX_IMAGE_CACHE) {
    const first = imageCache.keys().next().value;
    if (!first) break;
    imageCache.delete(first);
  }
}

async function fetchBuffer(url) {
  const cached = getImageFromCache(url);
  if (cached) return cached;

  if (pendingDownloads.has(url)) {
    return pendingDownloads.get(url);
  }

  const promise = (async () => {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "blvckTOP/7.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Download immagine fallito (${response.status})`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    setImageCache(url, buffer);
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

function numberSvg(rank, layout, accent) {
  const { canvas, card, number } = layout;
  const isDouble = String(rank).length > 1;
  const fontSize = isDouble ? number.sizeDouble : number.sizeSingle;
  const x = isDouble ? number.xDouble : number.xSingle;

  const centerY = card.y + card.height / 2;
  const y = centerY + fontSize * 0.34 + number.opticalDrop;

  const strokeWidth = layout === LAYOUTS.poster ? 10 : 11;

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
      background: 0
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

export async function createTopCover({
  rank,
  artworkUrl,
  logoUrl = null,
  shape = "landscape",
  accent = "#FFFFFF"
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

  const { canvas, card, logo: logoConf } = layout;

  const composites = [
    // Soft brand tint around the number area.
    { input: ambient, left: 0, top: 0 },

    // Number goes behind the card.
    { input: numberSvg(rank, layout, accent), left: 0, top: 0 },

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

  if (logoUrl) {
    try {
      const logoBuffer = await fetchBuffer(logoUrl);
      const logo = await prepareLogo(logoBuffer, layout);

      composites.push({
        input: logo.buffer,
        left: Math.round(card.x + logoConf.left - logo.pad),
        top: Math.round(
          card.y +
          card.height -
          logoConf.bottom -
          logo.visibleHeight -
          logo.pad
        )
      });
    } catch (err) {
      console.warn("Logo non disponibile:", err.message);
    }
  }

  return sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png({
      compressionLevel: 8,
      adaptiveFiltering: true
    })
    .toBuffer();
}
