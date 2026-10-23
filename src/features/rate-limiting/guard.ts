import "server-only";
import { consumeRateLimit, type RateLimitEndpoint } from "./limit";
import { trustedIp } from "./trusted-ip";

export async function checkRateLimit(
  request: Request,
  endpoint: RateLimitEndpoint,
): Promise<Response | null> {
  try {
    const ip = trustedIp(request);
    const secret = process.env.RATE_LIMIT_IP_HASH_SECRET;
    if (!ip || !secret?.trim() || Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("Rate limit unavailable");
    }
    // La importación diferida permite devolver 503 si falta configuración Redis,
    // incluso cuando el módulo existente rechaza su inicialización.
    const { getRateLimitRedis } = await import("../visit-tracking/redis/redis");
    const result = await consumeRateLimit(getRateLimitRedis(), endpoint, ip, secret);
    if (result.allowed) return null;
    return Response.json(
      {
        codigo: "BFF_LIMITE_SOLICITUDES",
        mensaje: "Demasiadas solicitudes. Esperá un momento e intentá nuevamente.",
      },
      {
        status: 429,
        headers: { "Cache-Control": "no-store", "Retry-After": String(result.retryAfter) },
      },
    );
  } catch {
    // Puede haberse consumido cuota aunque la respuesta se haya perdido.
    // No reintentar ni registrar errores del SDK (pueden contener la clave).
    return Response.json(
      {
        codigo: "BFF_CONTROL_SOLICITUDES_NO_DISPONIBLE",
        mensaje: "No se pudo verificar la disponibilidad de la operación. Intentá más tarde.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
