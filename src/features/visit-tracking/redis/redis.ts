import "server-only";
import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error("Upstash Redis environment variables are not configured");
}

export const redis = new Redis({
  url,
  token,
});

let rateLimitRedis: Redis | undefined;

export function getRateLimitRedis(): Redis {
  // Mismos datos de conexión. La instancia de visitas conserva sus opciones.
  // El SDK no permite ajustar retries por EVAL; se necesita esta única instancia
  // adicional. En 1.39.0 retry:false aún hace dos intentos: usar retries:0.
  rateLimitRedis ??= new Redis({
    url,
    token,
    retry: { retries: 0 },
    enableAutoPipelining: false,
    signal: () => AbortSignal.timeout(1500),
  });
  return rateLimitRedis;
}
