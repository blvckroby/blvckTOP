import crypto from "node:crypto";

function getKey() {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 24) {
    throw new Error(
      "APP_SECRET mancante o troppo corto. Imposta una stringa lunga e stabile nelle variabili d'ambiente."
    );
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function encryptConfig(config) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  const plain = Buffer.from(JSON.stringify(config), "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptConfig(token) {
  try {
    const key = getKey();
    const payload = Buffer.from(token, "base64url");

    if (payload.length < 29) throw new Error("Token non valido");

    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    const plain = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    const parsed = JSON.parse(plain.toString("utf8"));

    if (!Array.isArray(parsed.catalogs) || !parsed.tmdbApiKey) {
      throw new Error("Configurazione incompleta");
    }

    return parsed;
  } catch {
    throw new Error("Configurazione non valida o scaduta.");
  }
}

export function shortConfigId(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex")
    .slice(0, 12);
}
