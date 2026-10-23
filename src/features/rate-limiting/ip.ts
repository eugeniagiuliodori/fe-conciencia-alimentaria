import "server-only";
import { isIP } from "node:net";

export function normalizeIp(value: string | null): string | null {
  if (!value || value.includes("%")) return null;
  const ip = value.trim();
  const version = isIP(ip);
  if (version === 4) return ip;
  if (version !== 6) return null;

  // WHATWG URL comprime IPv6, elimina ceros iniciales y normaliza a minúsculas.
  const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16);
  const low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}
