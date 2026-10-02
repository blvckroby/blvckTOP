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

function getBrandPalette(accent = "#8C75FF", catalogKey = "") {
  const key = String(catalogKey || "").toLowerCase();
  
  if (key.includes("netflix") || accent.toUpperCase() === "#E50914") {
    return {
      atmo: { c1: "#3d080c", c2: "#1f0305", c3: "#0a0102" },
      body: { c1: "#570a10", c2: "#38060a", c3: "#1a0204", c4: "#050001" },
      stroke: { s1: "#FFFFFF", s2: "#FECDD3", s3: "#F43F5E", s4: "#881337", s5: "#FDA4AF", s6: "#FFFFFF" },
      sheen: { c1: "#FFFFFF", c2: "#FECDD3" },
      bounce: { c1: "#E11D48", c2: "#FDA4AF" }
    };
  }

  if (key.includes("prime") || key.includes("amazon") || accent.toUpperCase() === "#00A8E1") {
    return {
      atmo: { c1: "#002847", c2: "#001324", c3: "#00050d" },
      body: { c1: "#004073", c2: "#002447", c3: "#001021", c4: "#00040a" },
      stroke: { s1: "#FFFFFF", s2: "#BAE6FD", s3: "#38BDF8", s4: "#0284C7", s5: "#7DD3FC", s6: "#FFFFFF" },
      sheen: { c1: "#FFFFFF", c2: "#BAE6FD" },
      bounce: { c1: "#0284C7", c2: "#7DD3FC" }
    };
  }

  if (key.includes("now") || key.includes("sky") || accent.toUpperCase() === "#00E575" || accent.toUpperCase() === "#00CFFF") {
    return {
      atmo: { c1: "#003319", c2: "#00170a", c3: "#000603" },
      body: { c1: "#005229", c2: "#003319", c3: "#00170b", c4: "#000502" },
      stroke: { s1: "#FFFFFF", s2: "#BBF7D0", s3: "#4ADE80", s4: "#15803D", s5: "#86EFAC", s6: "#FFFFFF" },
      sheen: { c1: "#FFFFFF", c2: "#BBF7D0" },
      bounce: { c1: "#16A34A", c2: "#86EFAC" }
    };
  }

  if (key.includes("disney") || accent.toUpperCase() === "#2D7DFF" || accent.toUpperCase() === "#155EEF") {
    return {
      atmo: { c1: "#0c1d42", c2: "#060e21", c3: "#02040a" },
      body: { c1: "#142d69", c2: "#0c1d42", c3: "#060d1f", c4: "#02040a" },
      stroke: { s1: "#FFFFFF", s2: "#BFDBFE", s3: "#60A5FA", s4: "#1D4ED8", s5: "#93C5FD", s6: "#FFFFFF" },
      sheen: { c1: "#FFFFFF", c2: "#BFDBFE" },
      bounce: { c1: "#2563EB", c2: "#93C5FD" }
    };
  }

  if (key.includes("apple") || accent.toUpperCase() === "#D8DFEA" || accent.toUpperCase() === "#F4F5F7") {
    return {
      atmo: { c1: "#26292e", c2: "#14161a", c3: "#08080a" },
      body: { c1: "#3c4048", c2: "#26292e", c3: "#14161a", c4: "#060708" },
      stroke: { s1: "#FFFFFF", s2: "#F1F5F9", s3: "#94A3B8", s4: "#475569", s5: "#CBD5E1", s6: "#FFFFFF" },
      sheen: { c1: "#FFFFFF", c2: "#F1F5F9" },
      bounce: { c1: "#64748B", c2: "#E2E8F0" }
    };
  }

  if (key.includes("hbo") || key.includes("max") || accent.toUpperCase() === "#7D57FF") {
    return {
      atmo: { c1: "#2c0b47", c2: "#160524", c3: "#07010d" },
      body: { c1: "#4a1478", c2: "#2c0b47", c3: "#130421", c4: "#040108" },
      stroke: { s1: "#FFFFFF", s2: "#DDD6FE", s3: "#A78BFA", s4: "#6D28D9", s5: "#C4B5FD", s6: "#FFFFFF" },
      sheen: { c1: "#FFFFFF", c2: "#DDD6FE" },
      bounce: { c1: "#7C3AED", c2: "#C4B5FD" }
    };
  }

  if (key.includes("paramount") || accent.toUpperCase() === "#0064FF") {
    return {
      atmo: { c1: "#001a44", c2: "#000d24", c3: "#00040d" },
      body: { c1: "#002a6e", c2: "#001a44", c3: "#000d24", c4: "#00030a" },
      stroke: { s1: "#FFFFFF", s2: "#BAE6FD", s3: "#38BDF8", s4: "#0284C7", s5: "#7DD3FC", s6: "#FFFFFF" },
      sheen: { c1: "#FFFFFF", c2: "#BAE6FD" },
      bounce: { c1: "#0284C7", c2: "#7DD3FC" }
    };
  }

  if (key.includes("rai") || accent.toUpperCase() === "#1C6DFF" || accent.toUpperCase() === "#0066CC") {
    return {
      atmo: { c1: "#002047", c2: "#001026", c3: "#00050f" },
      body: { c1: "#003575", c2: "#002047", c3: "#001026", c4: "#00040a" },
      stroke: { s1: "#FFFFFF", s2: "#BAE6FD", s3: "#38BDF8", s4: "#0369A1", s5: "#7DD3FC", s6: "#FFFFFF" },
      sheen: { c1: "#FFFFFF", c2: "#BAE6FD" },
      bounce: { c1: "#0284C7", c2: "#7DD3FC" }
    };
  }

  if (key.includes("infinity") || key.includes("mediaset") || accent.toUpperCase() === "#00A3E0") {
    return {
      atmo: { c1: "#002538", c2: "#00121d", c3: "#00060b" },
      body: { c1: "#003d5c", c2: "#002538", c3: "#00121d", c4: "#000508" },
      stroke: { s1: "#FFFFFF", s2: "#BAE6FD", s3: "#38BDF8", s4: "#0284C7", s5: "#7DD3FC", s6: "#FFFFFF" },
      sheen: { c1: "#FFFFFF", c2: "#BAE6FD" },
      bounce: { c1: "#0284C7", c2: "#7DD3FC" }
    };
  }

  // Generic calculated from accent RGB
  const rgb = hexToRgb(accent);
  const r1 = Math.round(rgb.r * 0.35), g1 = Math.round(rgb.g * 0.35), b1 = Math.round(rgb.b * 0.35);
  const r2 = Math.round(rgb.r * 0.18), g2 = Math.round(rgb.g * 0.18), b2 = Math.round(rgb.b * 0.18);
  const r3 = Math.round(rgb.r * 0.05), g3 = Math.round(rgb.g * 0.05), b3 = Math.round(rgb.b * 0.05);

  return {
    atmo: { c1: `rgb(${r1},${g1},${b1})`, c2: `rgb(${r2},${g2},${b2})`, c3: `rgb(${r3},${g3},${b3})` },
    body: { c1: `rgb(${Math.round(rgb.r * 0.5)},${Math.round(rgb.g * 0.5)},${Math.round(rgb.b * 0.5)})`, c2: `rgb(${r1},${g1},${b1})`, c3: `rgb(${r2},${g2},${b2})`, c4: `rgb(${r3},${g3},${b3})` },
    stroke: { s1: "#FFFFFF", s2: "#E0E7FF", s3: accent, s4: `rgb(${r1},${g1},${b1})`, s5: "#C7D2FE", s6: "#FFFFFF" },
    sheen: { c1: "#FFFFFF", c2: "#E0E7FF" },
    bounce: { c1: accent, c2: "#FFFFFF" }
  };
}

function generateGlassBackground(width, height, mode = "stremio", accent = "#8C75FF", catalogKey = "") {
  if (mode === "black" || mode === "nero") {
    return Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="#000000"/>
      </svg>
    `);
  }
  if (mode === "transparent") {
    return Buffer.from(`
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"/>
    `);
  }

  const isProvider = mode === "provider" || mode === "brand";
  const pal = isProvider ? getBrandPalette(accent, catalogKey) : {
    atmo: { c1: "#2e2569", c2: "#1b1642", c3: "#0a081c" },
    body: { c1: "#483896", c2: "#322673", c3: "#1d1647", c4: "#050410" },
    stroke: { s1: "#FFFFFF", s2: "#E0E7FF", s3: "#A5B4FC", s4: "#6366F1", s5: "#C7D2FE", s6: "#FFFFFF" },
    sheen: { c1: "#FFFFFF", c2: "#C7D2FE" },
    bounce: { c1: "#818CF8", c2: "#C7D2FE" }
  };

  const pad = 12;
  const rw = width - pad * 2;
  const rh = height - pad * 2;
  const rx = Math.round(width * 0.032);
  const strokeW = width > 1100 ? 4.0 : 3.5;

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Canvas Ambient Atmosphere -->
        <radialGradient id="glassAtmosphere" cx="50%" cy="25%" r="75%">
          <stop offset="0%" stop-color="${pal.atmo.c1}"/>
          <stop offset="42%" stop-color="${pal.atmo.c2}"/>
          <stop offset="100%" stop-color="${pal.atmo.c3}"/>
        </radialGradient>

        <!-- Liquid Glass Card Interior: Strong top gradient flowing into ultra-deep dark bottom -->
        <linearGradient id="glassBodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${pal.body.c1}" stop-opacity="0.95"/>
          <stop offset="20%" stop-color="${pal.body.c2}" stop-opacity="0.92"/>
          <stop offset="50%" stop-color="${pal.body.c3}" stop-opacity="0.95"/>
          <stop offset="80%" stop-color="${pal.atmo.c3}" stop-opacity="0.98"/>
          <stop offset="100%" stop-color="${pal.body.c4}" stop-opacity="1.0"/>
        </linearGradient>

        <!-- Top Internal Glass Light Sheen -->
        <linearGradient id="innerGlassSheen" x1="0" y1="0" x2="0.8" y2="0.6">
          <stop offset="0%" stop-color="${pal.sheen.c1}" stop-opacity="0.28"/>
          <stop offset="35%" stop-color="${pal.sheen.c2}" stop-opacity="0.10"/>
          <stop offset="100%" stop-color="${pal.bounce.c1}" stop-opacity="0"/>
        </linearGradient>

        <!-- 3D Liquid Glass Border Rim -->
        <linearGradient id="glassStrokeGrad" x1="0" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stop-color="${pal.stroke.s1}" stop-opacity="1.0"/>
          <stop offset="16%" stop-color="${pal.stroke.s2}" stop-opacity="0.90"/>
          <stop offset="40%" stop-color="${pal.stroke.s3}" stop-opacity="0.55"/>
          <stop offset="70%" stop-color="${pal.stroke.s4}" stop-opacity="0.38"/>
          <stop offset="88%" stop-color="${pal.stroke.s5}" stop-opacity="0.70"/>
          <stop offset="100%" stop-color="${pal.stroke.s6}" stop-opacity="0.90"/>
        </linearGradient>

        <!-- Inner Bevel Stroke -->
        <linearGradient id="innerBevelGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.60"/>
          <stop offset="25%" stop-color="#FFFFFF" stop-opacity="0.12"/>
          <stop offset="65%" stop-color="#000000" stop-opacity="0"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.65"/>
        </linearGradient>

        <!-- Top Edge Specular Flare -->
        <linearGradient id="topFlare" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0"/>
          <stop offset="20%" stop-color="#FFFFFF" stop-opacity="0.90"/>
          <stop offset="50%" stop-color="#FFFFFF" stop-opacity="1.0"/>
          <stop offset="80%" stop-color="#FFFFFF" stop-opacity="0.90"/>
          <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
        </linearGradient>

        <!-- Bottom Rim Light Bounce -->
        <linearGradient id="bottomRimFlare" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${pal.bounce.c1}" stop-opacity="0"/>
          <stop offset="30%" stop-color="${pal.bounce.c2}" stop-opacity="0.60"/>
          <stop offset="50%" stop-color="#FFFFFF" stop-opacity="0.85"/>
          <stop offset="70%" stop-color="${pal.bounce.c2}" stop-opacity="0.60"/>
          <stop offset="100%" stop-color="${pal.bounce.c1}" stop-opacity="0"/>
        </linearGradient>

        <!-- Outer Drop Shadow -->
        <filter id="glassShadow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="12" stdDeviation="22" flood-color="#020105" flood-opacity="0.94"/>
        </filter>
      </defs>

      <!-- Atmosphere Fill -->
      <rect width="${width}" height="${height}" fill="url(#glassAtmosphere)"/>

      <!-- Liquid Glass Container -->
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
          stroke-width="${strokeW}"
        />
        <rect
          x="${pad + 1.5}"
          y="${pad + 1.5}"
          width="${rw - 3}"
          height="${rh - 3}"
          rx="${rx - 1.5}"
          ry="${rx - 1.5}"
          fill="url(#innerGlassSheen)"
          stroke="url(#innerBevelGrad)"
          stroke-width="1.5"
        />
      </g>

      <!-- Top Lip -->
      <path
        d="M ${pad + rx + 8} ${pad + 2} Q ${width / 2} ${pad + 1.2} ${width - pad - rx - 8} ${pad + 2}"
        stroke="url(#topFlare)"
        stroke-width="${strokeW}"
        stroke-linecap="round"
        fill="none"
      />

      <!-- Bottom Lip -->
      <path
        d="M ${pad + rx + 14} ${height - pad - 2} Q ${width / 2} ${height - pad - 1.2} ${width - pad - rx - 14} ${height - pad - 2}"
        stroke="url(#bottomRimFlare)"
        stroke-width="2.5"
        stroke-linecap="round"
        fill="none"
      />
    </svg>
  `);
}

export function getProviderLogoSvg(catalogKey = "") {
  const key = String(catalogKey || "").toLowerCase();

  if (key.includes("netflix")) {
    return {
      width: 32,
      height: 32,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="#E50914" d="M5.398 0v24c1.196-.453 2.457-.852 3.782-1.196V0H5.398zm9.422 0v21.656c1.325.344 2.586.743 3.782 1.196V0h-3.782zM9.18 0l6.398 22.848c-.961-.266-1.938-.504-2.922-.715L6.258 0H9.18z"/></svg>`
    };
  }

  if (key.includes("prime") || key.includes("amazon")) {
    return {
      width: 76,
      height: 24,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 30" width="76" height="24"><path fill="#00A8E1" d="M37.2 16.4c0-2.3 1.8-3.4 4.5-3.4 2.4 0 3.4.4 4.8 1.1v-1.8c-.8-.6-2.3-1.1-4.7-1.1-4.8 0-7.8 2.5-7.8 6.4 0 6.4 7.6 4.3 7.6 7.4 0 1.2-1 1.7-2.6 1.7-2.4 0-4.3-1-5.4-2l-1.8 2.4c1.5 1.5 4 2.6 7.1 2.6 4.6 0 5.9-2.7 5.9-5.3 0-5.8-7.6-4.5-7.6-8z"/><path fill="#FFF" d="M7 21.8h3.3V7.9H7v13.9zm5.7-10.2h3.2v2c1-1.6 2.8-2.3 4.6-2.3 3.3 0 5.4 2.2 5.4 5.7v6.7h-3.3v-6.3c0-2-.9-3.2-2.5-3.2-1.8 0-3 1.3-3.3 2.7v6.8h-3.3v-12.1h-0.8z"/><path fill="#FF9900" d="M4.6 25.4c18 6.8 45.4 3.7 63.4-5.3.6-.3 1.3.3.8.9-6.4 7-23.7 10.4-38.9 10.4-10.4 0-21.7-2.4-26-5.2-.6-.4-.1-1 .7-.8z"/><path fill="#FF9900" d="M68.8 18.2c-.7-.9-4.8-.4-6.6-.2-.3 0-.4-.3-.1-.5 2-1.3 5.4-1 6.8.6 1.3 1.5.8 5-.9 6.7-.2.2-.5.1-.4-.2.4-1.8.8-5.6.2-6.4z"/></svg>`
    };
  }

  if (key.includes("disney")) {
    return {
      width: 70,
      height: 28,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 40" width="70" height="28"><path fill="#FFF" d="M40.7 20.3c.7-1.2 1.1-2.4 1.1-3.6 0-3.3-3.1-5.7-8.8-5.7-7.2 0-14.8 4.2-14.8 10.7 0 4.9 4.3 7.8 8.8 7.8 7.1 0 12.6-5.8 13.7-9.2zm-9.3 6.6c-2.8 0-4.7-1.8-4.7-4.4 0-3.5 4.3-6.8 8.4-6.8 3.5 0 4.8 1.7 4.8 3.5 0 3-4.5 7.7-8.5 7.7zm24.4-15.5c-1.3 0-2.4.9-2.4 2.2 0 1.2 1.1 2.2 2.4 2.2 1.3 0 2.3-1 2.3-2.2 0-1.3-1-2.2-2.3-2.2zm-1.8 7.1h3.6v12.7h-3.6V18.5zm19.6 4.3c-2.3-.6-4.5-.9-4.5-2.1 0-.9 1-1.4 2.2-1.4 1.8 0 3.3.7 4.2 1.5l1.8-2.6c-1.6-1.3-3.7-2-6-2-3.7 0-6 2.1-6 5 0 3.6 3.6 4.4 6.7 5.1 2.3.5 3.3 1.2 3.3 2.2 0 1.1-1.3 1.7-2.6 1.7-2.2 0-4.2-.9-5.4-2.1l-1.9 2.6c1.7 1.6 4.2 2.6 7.3 2.6 4.1 0 6.6-2.1 6.6-5.3 0-3.4-3.3-4.4-5.7-5.2z"/><path fill="#155EEF" d="M85 16.5h-2.5V14h-2v2.5H78v2h2.5V21h2v-2.5H85v-2z"/></svg>`
    };
  }

  if (key.includes("apple")) {
    return {
      width: 28,
      height: 28,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28"><path fill="#FFF" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.63-.76 1.06-1.82.94-2.88-.91.04-2.02.6-2.67 1.36-.58.68-1.09 1.76-.95 2.81 1.02.08 2.05-.53 2.68-1.29"/></svg>`
    };
  }

  if (key.includes("hbo") || key.includes("max")) {
    return {
      width: 52,
      height: 24,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="52" height="24"><path fill="#FFF" d="M1.38 5.75H4.6v4.61h3.33V5.75h3.22v12.5H7.93v-4.99H4.6v4.99H1.38V5.75zm10.3 0h6.14c3.44 0 6.18 2.8 6.18 6.25s-2.74 6.25-6.18 6.25h-6.14V5.75zm3.22 3.12v6.26h2.92c1.72 0 3.11-1.4 3.11-3.13 0-1.73-1.39-3.13-3.11-3.13h-2.92zm6.75 3.13c0 .86-.7 1.56-1.55 1.56s-1.56-.7-1.56-1.56.7-1.56 1.56-1.56 1.55.7 1.55 1.56z"/></svg>`
    };
  }

  if (key.includes("paramount")) {
    return {
      width: 32,
      height: 32,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="#0064FF" d="M12 0c6.627 0 12 5.373 12 12s-5.373 12-12 12S0 18.627 0 12 5.373 0 12 0zm0 3.5l1.6 4.3 4.5.3-3.4 3 1 4.5L12 13.3 8.3 15.6l1-4.5-3.4-3 4.5-.3L12 3.5z"/></svg>`
    };
  }

  if (key.includes("now") || key.includes("sky")) {
    return {
      width: 58,
      height: 22,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 24" width="58" height="22"><path fill="#00E575" d="M0 2.5h5.8l8.2 12.3V2.5h5.5v19H14L5.5 8.8v12.7H0V2.5zm22.4 9.5c0-5.8 4.2-10 10.2-10s10.2 4.2 10.2 10-4.2 10-10.2 10-10.2-4.2-10.2-10zm14.8 0c0-3-1.9-5.1-4.6-5.1s-4.6 2.1-4.6 5.1 1.9 5.1 4.6 5.1 4.6-2.1 4.6-5.1zm9.8-9.5h5.5l4.1 13 4.1-13h5.2l4.1 13 4.1-13h5.4L69.8 21.5h-5.8L60 9.2l-4 12.3h-5.8L47 2.5z"/></svg>`
    };
  }

  if (key.includes("rai")) {
    return {
      width: 32,
      height: 32,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="#0066CC" d="M3 3h8c4 0 7 2.5 7 6.5 0 2.8-1.5 4.8-3.8 5.8L19 21h-4.5l-4-5.2H7V21H3V3zm4 3.6v5.8h4c2 0 3.5-1.2 3.5-2.9s-1.5-2.9-3.5-2.9H7z"/></svg>`
    };
  }

  if (key.includes("infinity") || key.includes("mediaset")) {
    return {
      width: 32,
      height: 32,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="#00A3E0" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5h-2v-5h2v5zm0-7h-2V7.5h2V9.5z"/></svg>`
    };
  }

  if (key.includes("timvision") || key.includes("tim")) {
    return {
      width: 32,
      height: 32,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="#003399" d="M2 5h20v4H14v10h-4V9H2V5z"/></svg>`
    };
  }

  if (key.includes("discovery")) {
    return {
      width: 32,
      height: 32,
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"><path fill="#003399" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l7 4.5-7 4.5z"/></svg>`
    };
  }

  return null;
}

function numberSvg(rank, layout, accent, genre = "", rating = "", canvasBackground = "transparent", showLogo = true, catalogId = "") {
  const { canvas, card, number } = layout;
  const isDouble = String(rank).length > 1;
  const fontSize = isDouble ? number.sizeDouble : number.sizeSingle;
  const x = isDouble ? number.xDouble : number.xSingle;

  const centerY = card.y + card.height / 2;
  const y = centerY + fontSize * 0.34 + number.opticalDrop;

  const strokeWidth = layout === LAYOUTS.poster ? 10 : 11;
  const isProvider = canvasBackground === "provider" || canvasBackground === "brand";

  const escapedGenre = escapeXml(cleanGenre(genre));
  const ratingVal = formatRating(rating);
  const isLandscape = layout === LAYOUTS.landscape;

  const metaX = isLandscape ? 640 : 500;
  const metaY = isLandscape ? 668 : 1380;

  const rawLogo = (showLogo && catalogId) ? getProviderLogoSvg(catalogId) : null;
  const logoObj = rawLogo ? {
    width: isLandscape ? rawLogo.width : Math.round(rawLogo.width * 1.35),
    height: isLandscape ? rawLogo.height : Math.round(rawLogo.height * 1.35),
    svg: rawLogo.svg
  } : null;

  let metaXml = "";

  if (isLandscape) {
    const gSize = escapedGenre.length > 14 ? 32 : (escapedGenre.length > 10 ? 36 : 40);
    const starSize = 46;
    const dotSize = 30;

    if (logoObj && (escapedGenre || ratingVal)) {
      // Symmetrical Layout: GENERE • [Logo Provider] • ★ VOTO
      const logoHref = `data:image/svg+xml;base64,${Buffer.from(logoObj.svg).toString("base64")}`;
      const leftPart = escapedGenre ? `
        <text x="${metaX - logoObj.width / 2 - 14}" y="${metaY}" text-anchor="end" font-family="Inter, -apple-system, sans-serif" filter="url(#metaShadow)">
          <tspan fill="#F1F5F9" font-size="${gSize}" font-weight="900" letter-spacing="2.5">${escapedGenre}</tspan>
          <tspan fill="#94A3B8" font-size="${dotSize}" font-weight="800">   •</tspan>
        </text>
      ` : "";

      const centerLogo = `
        <g filter="url(#metaShadow)">
          <image href="${logoHref}" x="${metaX - logoObj.width / 2}" y="${metaY - logoObj.height + 6}" width="${logoObj.width}" height="${logoObj.height}" />
        </g>
      `;

      const rightPart = ratingVal ? `
        <text x="${metaX + logoObj.width / 2 + 14}" y="${metaY}" text-anchor="start" font-family="Inter, -apple-system, sans-serif" filter="url(#metaShadow)">
          <tspan fill="#94A3B8" font-size="${dotSize}" font-weight="800">•   </tspan>
          <tspan fill="#FFB800" font-size="${starSize}" font-weight="900">★ </tspan>
          <tspan fill="#FFFFFF" font-size="${starSize}" font-weight="900">${ratingVal}</tspan>
        </text>
      ` : "";

      metaXml = `${leftPart}${centerLogo}${rightPart}`;
    } else if (logoObj) {
      // Only Logo Centered
      const logoHref = `data:image/svg+xml;base64,${Buffer.from(logoObj.svg).toString("base64")}`;
      metaXml = `
        <g filter="url(#metaShadow)">
          <image href="${logoHref}" x="${metaX - logoObj.width / 2}" y="${metaY - logoObj.height + 6}" width="${logoObj.width}" height="${logoObj.height}" />
        </g>
      `;
    } else if (escapedGenre && ratingVal) {
      // Standard Centered Meta: GENERE • ★ VOTO
      metaXml = `
        <text x="${metaX}" y="${metaY}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif" filter="url(#metaShadow)">
          <tspan fill="#F1F5F9" font-size="${gSize}" font-weight="900" letter-spacing="2.5">${escapedGenre}</tspan>
          <tspan fill="#94A3B8" font-size="${dotSize}" font-weight="800">   •   </tspan>
          <tspan fill="#FFB800" font-size="${starSize}" font-weight="900">★ </tspan>
          <tspan fill="#FFFFFF" font-size="${starSize}" font-weight="900">${ratingVal}</tspan>
        </text>
      `;
    } else if (escapedGenre) {
      metaXml = `<text x="${metaX}" y="${metaY}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="40" font-weight="900" letter-spacing="2.5" fill="#F1F5F9" filter="url(#metaShadow)">${escapedGenre}</text>`;
    } else if (ratingVal) {
      metaXml = `<text x="${metaX}" y="${metaY}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="46" font-weight="900" filter="url(#metaShadow)"><tspan fill="#FFB800">★ </tspan><tspan fill="#FFFFFF">${ratingVal}</tspan></text>`;
    }
  } else {
    // Poster / Portrait
    const gSize = escapedGenre.length > 14 ? 44 : (escapedGenre.length > 10 ? 48 : 52);
    const starSize = 64;
    const dotSize = 38;

    if (logoObj && (escapedGenre || ratingVal)) {
      // Symmetrical Layout: GENERE • [Logo Provider] • ★ VOTO
      const logoHref = `data:image/svg+xml;base64,${Buffer.from(logoObj.svg).toString("base64")}`;
      const leftPart = escapedGenre ? `
        <text x="${metaX - logoObj.width / 2 - 18}" y="${metaY}" text-anchor="end" font-family="Inter, -apple-system, sans-serif" filter="url(#metaShadow)">
          <tspan fill="#F1F5F9" font-size="${gSize}" font-weight="900" letter-spacing="3">${escapedGenre}</tspan>
          <tspan fill="#94A3B8" font-size="${dotSize}" font-weight="800">   •</tspan>
        </text>
      ` : "";

      const centerLogo = `
        <g filter="url(#metaShadow)">
          <image href="${logoHref}" x="${metaX - logoObj.width / 2}" y="${metaY - logoObj.height + 8}" width="${logoObj.width}" height="${logoObj.height}" />
        </g>
      `;

      const rightPart = ratingVal ? `
        <text x="${metaX + logoObj.width / 2 + 18}" y="${metaY}" text-anchor="start" font-family="Inter, -apple-system, sans-serif" filter="url(#metaShadow)">
          <tspan fill="#94A3B8" font-size="${dotSize}" font-weight="800">•   </tspan>
          <tspan fill="#FFB800" font-size="${starSize}" font-weight="900">★ </tspan>
          <tspan fill="#FFFFFF" font-size="${starSize}" font-weight="900">${ratingVal}</tspan>
        </text>
      ` : "";

      metaXml = `${leftPart}${centerLogo}${rightPart}`;
    } else if (logoObj) {
      // Only Logo Centered
      const logoHref = `data:image/svg+xml;base64,${Buffer.from(logoObj.svg).toString("base64")}`;
      metaXml = `
        <g filter="url(#metaShadow)">
          <image href="${logoHref}" x="${metaX - logoObj.width / 2}" y="${metaY - logoObj.height + 8}" width="${logoObj.width}" height="${logoObj.height}" />
        </g>
      `;
    } else if (escapedGenre && ratingVal) {
      metaXml = `
        <text x="${metaX}" y="${metaY}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif" filter="url(#metaShadow)">
          <tspan fill="#F1F5F9" font-size="${gSize}" font-weight="900" letter-spacing="3">${escapedGenre}</tspan>
          <tspan fill="#94A3B8" font-size="${dotSize}" font-weight="800">   •   </tspan>
          <tspan fill="#FFB800" font-size="${starSize}" font-weight="900">★ </tspan>
          <tspan fill="#FFFFFF" font-size="${starSize}" font-weight="900">${ratingVal}</tspan>
        </text>
      `;
    } else if (escapedGenre) {
      metaXml = `<text x="${metaX}" y="${metaY}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="52" font-weight="900" letter-spacing="3" fill="#F1F5F9" filter="url(#metaShadow)">${escapedGenre}</text>`;
    } else if (ratingVal) {
      metaXml = `<text x="${metaX}" y="${metaY}" text-anchor="middle" font-family="Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif" font-size="64" font-weight="900" filter="url(#metaShadow)"><tspan fill="#FFB800">★ </tspan><tspan fill="#FFFFFF">${ratingVal}</tspan></text>`;
    }
  }

  let defsFilterAndStroke;
  if (isProvider) {
    // Pure Crystal Glass Number (transparent, no colored neon glow)
    defsFilterAndStroke = `
      <linearGradient id="crystalGlassStroke" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.95"/>
        <stop offset="30%" stop-color="#FFFFFF" stop-opacity="0.80"/>
        <stop offset="65%" stop-color="#E2E8F0" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#CBD5E1" stop-opacity="0.85"/>
      </linearGradient>
      <filter id="numFilter" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="#000000" flood-opacity="0.95"/>
        <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="whiteGlow"/>
        <feFlood flood-color="#FFFFFF" flood-opacity="0.40" result="whiteColor"/>
        <feComposite in="whiteColor" in2="whiteGlow" operator="in" result="glassRim"/>
        <feMerge>
          <feMergeNode in="glassRim"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    `;
  } else {
    // Standard Neon Glow with brand accent
    defsFilterAndStroke = `
      <linearGradient id="strokeGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity=".98"/>
        <stop offset="48%" stop-color="#F1F2F4" stop-opacity=".94"/>
        <stop offset="100%" stop-color="#C9CDD3" stop-opacity=".86"/>
      </linearGradient>

      <filter id="numFilter" x="-120%" y="-120%" width="340%" height="340%">
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
    `;
  }

  const strokeUrl = isProvider ? "url(#crystalGlassStroke)" : "url(#strokeGrad)";

  return Buffer.from(`
    <svg width="${canvas.width}" height="${canvas.height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${defsFilterAndStroke}

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
        stroke="${strokeUrl}"
        stroke-width="${strokeWidth}"
        stroke-linejoin="round"
        paint-order="stroke"
        filter="url(#numFilter)"
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
  rating = "",
  catalogId = "",
  showLogo = true
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
  const bgLower = String(canvasBackground || "").toLowerCase().trim();
  const isProvider = bgLower === "provider" || bgLower === "brand";
  const isStremio = bgLower === "stremio" || bgLower === "stremio-navy" || bgLower === "rgb(26,23,62)" || bgLower === "rgb(26, 23, 62)" || bgLower === "#1a173e" || bgLower === "1a173e";

  const composites = [];

  // Soft brand tint around the number area (only for standard/neon modes)
  if (!isProvider) {
    composites.push({ input: ambient, left: 0, top: 0 });
  }

  // Number and metadata go behind the card.
  composites.push(
    { input: numberSvg(rank, layout, accent, genre, rating, canvasBackground, showLogo, catalogId), left: 0, top: 0 },
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
  );

  let baseSharp;
  if (isProvider) {
    baseSharp = sharp(generateGlassBackground(canvas.width, canvas.height, "provider", accent, catalogId));
  } else if (isStremio) {
    baseSharp = sharp(generateGlassBackground(canvas.width, canvas.height, "stremio", accent, catalogId));
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
