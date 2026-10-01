import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const VERSION = "1.0.0";

// Only application-authored messages cross the CLI/persistence boundary.
export class FichaError extends Error {
  constructor(stage, code, message, retryable = true) {
    super(message);
    this.stage = stage;
    this.code = code;
    this.retryable = retryable;
  }
}

export function fail(stage, code, message, retryable = true) {
  throw new FichaError(stage, code, message, retryable);
}

export function safeError(error, stage = "PERSISTENCIA") {
  return error instanceof FichaError
    ? error
    : new FichaError(
        stage,
        "OPERACION_FALLIDA",
        "La operación no pudo completarse. No se registró el mensaje externo para evitar exponer datos sensibles.",
      );
}

export function isCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return (
    day <=
    [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  );
}

export function isHttpUrl(value) {
  if (
    typeof value !== "string" ||
    !/^https?:\/\/[^/?#]/i.test(value) ||
    /[\s\\\u0000-\u001f\u007f]/u.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createIdentity(date, originalUrl) {
  if (!isCalendarDate(date))
    fail(
      "ENTRADA",
      "FECHA_INVALIDA",
      "--fecha debe ser una fecha real YYYY-MM-DD (año 0001 a 9999).",
      false,
    );
  if (typeof originalUrl !== "string" || !isHttpUrl(originalUrl.trim())) {
    fail(
      "ENTRADA",
      "URL_INVALIDA",
      "--url debe ser una URL HTTP(S) absoluta, sin credenciales ni caracteres de control internos.",
      false,
    );
  }
  const url = originalUrl.trim();
  return {
    date,
    month: date.slice(0, 7),
    originalUrl,
    url,
    key: sha256(`ficha:v1\n${date}\n${url}`),
  };
}

export function parseArgs(args) {
  const options = { force: false, help: false };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (
      !["--fecha", "--url", "--force", "--help"].includes(argument) ||
      seen.has(argument)
    ) {
      fail(
        "ENTRADA",
        "ARGUMENTOS_INVALIDOS",
        "Hay opciones desconocidas, repetidas o argumentos sueltos. Consultá --help.",
        false,
      );
    }
    seen.add(argument);
    if (argument === "--force") options.force = true;
    else if (argument === "--help") options.help = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith("--"))
        fail(
          "ENTRADA",
          "ARGUMENTOS_INVALIDOS",
          "Falta el valor de --fecha o --url. Consultá --help.",
          false,
        );
      options[argument === "--fecha" ? "date" : "url"] = value;
    }
  }
  if (!options.help) createIdentity(options.date, options.url);
  return options;
}

export function wordCount(text) {
  return text.match(/[\p{L}\p{N}]+(?:[’'.,-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

export function assertNoSecret(value, secret) {
  // Also inspect decoded strings: JSON escaping must not defeat this check.
  if (!secret || value === undefined || value === null) return;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.includes(secret) || text.includes(encodeURIComponent(secret))) {
    fail(
      "VALIDACION_JSON",
      "DATO_SENSIBLE",
      "Se detectó una credencial en los datos. Se rechazó su registro.",
      false,
    );
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertNoSecret(key, secret);
      assertNoSecret(entry, secret);
    }
  }
}
