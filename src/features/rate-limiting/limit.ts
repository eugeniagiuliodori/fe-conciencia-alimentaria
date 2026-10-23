import "server-only";
import { createHmac } from "node:crypto";
import { normalizeIp } from "./ip";
import { RATE_LIMIT_SCRIPT } from "./script";

// Catálogo privado: cada ID representa exactamente método + ruta.
export const RATE_LIMIT_ENDPOINTS = {
  identification: "post-usuarios-identificacion",
  sessionStart: "post-usuarios-sesiones",
  sessionEnd: "delete-usuarios-sesiones-actual",
} as const;

export type RateLimitEndpoint =
  (typeof RATE_LIMIT_ENDPOINTS)[keyof typeof RATE_LIMIT_ENDPOINTS];

type RedisEvaluator = {
  eval(script: string, keys: string[], args: number[]): Promise<unknown>;
};

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number };

export async function consumeRateLimit(
  redis: RedisEvaluator,
  endpoint: RateLimitEndpoint,
  observedIp: string,
  secret: string | undefined,
): Promise<RateLimitResult> {
  const ip = normalizeIp(observedIp);
  if (
    !Object.values(RATE_LIMIT_ENDPOINTS).includes(endpoint) ||
    !ip || !secret?.trim() || Buffer.byteLength(secret, "utf8") < 32
  ) {
    throw new Error("Rate limit configuration unavailable");
  }

  const idIp = createHmac("sha256", secret)
    .update("conciencia-alimentaria:rate-limiting:ip:v1\n", "utf8")
    .update(ip, "utf8")
    .digest("hex");
  const result = await redis.eval(
    RATE_LIMIT_SCRIPT,
    [`rate-limiting:frontend:${endpoint}:${idIp}`],
    [30, 60_000],
  );

  if (
    !Array.isArray(result) || result.length !== 3 ||
    !result.every((value: unknown) => typeof value === "number" && Number.isSafeInteger(value))
  ) {
    throw new Error("Rate limit result unavailable");
  }
  const [admitted, count, ttl] = result;
  if (
    (admitted !== 0 && admitted !== 1) ||
    count < 1 || count > 30 || ttl < 0 || ttl > 60_000 ||
    (admitted === 0 && count !== 30)
  ) {
    throw new Error("Rate limit result unavailable");
  }
  return admitted === 1
    ? { allowed: true }
    : { allowed: false, retryAfter: Math.max(1, Math.ceil(ttl / 1000)) };
}
