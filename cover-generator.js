import sharp from "sharp";

const CANVAS = { width: 1280, height: 720 };

const CARD = {
  x: 300,
  y: 107,
  width: 900,
  height: 506,
  radius: 30
};

const NUMBER = {
  centerY: CARD.y + CARD.height / 2,
  xSingle: 62,
  xDouble: 24,
  sizeSingle: 450,
  sizeDouble: 370
};

const LOGO = {
  maxWidth: 380,
  maxHeight: 155,
  left: 46,
  bottom: 40
};

const imageCache = new Map();
const pendingDownloads = new Map();
const IMAGE_TTL = 6 * 60 * 60 * 1000;
const MAX_IMAGE_CACHE = 80;

function getImageFromCache(url) {
  const entry = imageCache.get(url);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) { imageCache.delete(url); return null; }
  return entry.buffer;
}

function saveImageToCache(url, buffer) {
  imageCache.set(url, { buffer, expiresAt: Date.now() + IMAGE_TTL });
  while (imageCache.size > MAX_IMAGE_CACHE) {
    const firstKey = imageCache.keys().next().value;
    if (!firstKey) break;
    imageCache.delete(firstKey);
  }
}

async function fetchBuffer(url) {
  const cached = getImageFromCache(url);
  if (cached) return cached;
  if (pendingDownloads.has(url)) return pendingDownloads.get(url);

  const promise = (async () => {
    const response = await fetch(url, { headers: { "User-Agent": "Nuvio-Top10-Custom-Covers/6.0" } });
    if (!response.ok) throw new Error(`Download immagine fallito (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    saveImageToCache(url, buffer);
    return buffer;
  })();

  pendingDownloads.set(url, promise);
  try { return await promise; }
  finally { pendingDownloads.delete(url); }
}

function numberSvg(rank) {
  const isDouble = String(rank).length > 1;
  const fontSize = isDouble ? NUMBER.sizeDouble : NUMBER.sizeSingle;
  const x = isDouble ? NUMBER.xDouble : NUMBER.xSingle;
  const y = NUMBER.centerY + fontSize * 0.34 + 8;

  return Buffer.from(`
    <svg width="${CANVAS.width}" height="${CANVAS.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="numGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.96"/>
          <stop offset="100%" stop-color="#D9D9D9" stop-opacity="0.82"/>
        </linearGradient>
      </defs>
      <text
        x="${x}"
        y="${y}"
        font-family="Inter, Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="800"
        letter-spacing="-16"
        fill="url(#numGrad)"
      >${rank}</text>
    </svg>
  `);
}

async function createRoundedArtwork(buffer) {
  const resized = await sharp(buffer)
    .resize(CARD.width, CARD.height, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 8, adaptiveFiltering: true })
    .toBuffer();

  const mask = Buffer.from(`
    <svg width="${CARD.width}" height="${CARD.height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="${CARD.radius}" ry="${CARD.radius}" fill="#fff"/>
    </svg>
  `);

  return sharp(resized)
    .composite([{ input: mask, blend: "dest-in" }])
    .png({ compressionLevel: 8, adaptiveFiltering: true })
    .toBuffer();
}

async function createCardShadow() {
  const svg = Buffer.from(`
    <svg width="${CARD.width + 100}" height="${CARD.height + 100}" xmlns="http://www.w3.org/2000/svg">
      <rect
        x="50"
        y="38"
        width="${CARD.width}"
        height="${CARD.height}"
        rx="${CARD.radius}"
        ry="${CARD.radius}"
        fill="#000"
        fill-opacity="0.48"
      />
    </svg>
  `);

  return sharp(svg).blur(22).png().toBuffer();
}

async function prepareLogo(buffer) {
  const meta = await sharp(buffer).metadata();
  let width = meta.width || LOGO.maxWidth;
  let height = meta.height || LOGO.maxHeight;

  const scale = Math.min(LOGO.maxWidth / width, LOGO.maxHeight / height, 1);
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const logo = await sharp(buffer)
    .resize({ width, height, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 8, adaptiveFiltering: true })
    .toBuffer();

  const pad = 32;
  const shadowW = width + pad * 2;
  const shadowH = height + pad * 2;

  const shadowMask = await sharp(logo)
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

  const blackShadow = await sharp({
    create: {
      width: shadowW,
      height: shadowH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0.56 }
    }
  })
    .composite([{ input: shadowMask, blend: "dest-in" }])
    .png({ compressionLevel: 8, adaptiveFiltering: true })
    .toBuffer();

  return {
    buffer: await sharp({
      create: {
        width: shadowW,
        height: shadowH,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([
        { input: blackShadow, left: 0, top: 6 },
        { input: logo, left: pad, top: pad }
      ])
      .png()
      .toBuffer(),
    visibleHeight: height,
    pad
  };
}

export async function createTopCover({ rank, artworkUrl, logoUrl = null }) {
  if (!artworkUrl) throw new Error("artworkUrl mancante.");

  const artworkBuffer = await fetchBuffer(artworkUrl);
  const [art, shadow] = await Promise.all([
    createRoundedArtwork(artworkBuffer),
    createCardShadow()
  ]);

  const composites = [
    { input: numberSvg(rank), left: 0, top: 0 },
    { input: shadow, left: CARD.x - 50, top: CARD.y - 38 + 14 },
    { input: art, left: CARD.x, top: CARD.y }
  ];

  if (logoUrl) {
    try {
      const logoBuffer = await fetchBuffer(logoUrl);
      const logo = await prepareLogo(logoBuffer);

      composites.push({
        input: logo.buffer,
        left: Math.round(CARD.x + LOGO.left - logo.pad),
        top: Math.round(
          CARD.y + CARD.height - LOGO.bottom - logo.visibleHeight - logo.pad
        )
      });
    } catch (err) {
      console.warn("Logo non disponibile:", err.message);
    }
  }

  return sharp({
    create: {
      width: CANVAS.width,
      height: CANVAS.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png({ compressionLevel: 8, adaptiveFiltering: true })
    .toBuffer();
}
