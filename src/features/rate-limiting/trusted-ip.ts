import "server-only";
import { normalizeIp } from "./ip";

// Adaptador de hosting. Vercel proporciona esta cabecera desde su proxy:
// https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
// No interpretar listas ni recurrir a X-Forwarded-For aportado por el cliente.
export function trustedIp(request: Request): string | null {
  if (
    process.env.VERCEL !== "1" ||
    process.env.NODE_ENV !== "production" ||
    !["production", "preview"].includes(process.env.VERCEL_ENV ?? "")
  ) {
    return null;
  }
  return normalizeIp(request.headers.get("x-vercel-forwarded-for"));
}
