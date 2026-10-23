import { checkRateLimit } from "@/features/rate-limiting/guard";
import { RATE_LIMIT_ENDPOINTS } from "@/features/rate-limiting/limit";
import { backendQuotaErrorResponse, discardBody, readBackendQuotaError } from "@/services/shared/backend-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;
const BACKEND_TIMEOUT_MS = 5000;

const errors = {
  400: {
    codigo: "SOLICITUD_INVALIDA",
    mensaje: "Datos de identificación inválidos.",
  },
  413: {
    codigo: "SOLICITUD_DEMASIADO_GRANDE",
    mensaje: "La solicitud supera el tamaño permitido.",
  },
  415: {
    codigo: "TIPO_CONTENIDO_NO_ADMITIDO",
    mensaje: "Tipo de contenido no admitido.",
  },
  502: {
    codigo: "SERVICIO_NO_DISPONIBLE",
    mensaje: "No se pudo confirmar el procesamiento de la solicitud. Intentá nuevamente más tarde.",
  },
  503: {
    codigo: "SERVICIO_NO_DISPONIBLE",
    mensaje: "La identificación no está disponible en este momento.",
  },
  504: {
    codigo: "TIEMPO_DE_ESPERA_AGOTADO",
    mensaje: "No se pudo confirmar la operación a tiempo. Intentá más tarde.",
  },
} as const;

function errorResponse(status: keyof typeof errors) {
  const headers = new Headers({ "Cache-Control": "no-store" });
  return Response.json(errors[status], { status, headers });
}

async function readEmail(request: Request): Promise<string | Response> {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim();
  if (mediaType?.toLowerCase() !== "application/json") {
    return errorResponse(415);
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) return errorResponse(400);
    if (Number(contentLength) > MAX_BODY_BYTES) return errorResponse(413);
  }

  const reader = request.body?.getReader();
  if (!reader) return errorResponse(400);

  // El límite se comprueba sobre los bytes recibidos, aun sin Content-Length.
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  let size = 0;
  let body: unknown;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return errorResponse(413);
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(0, size),
    );
    body = JSON.parse(text);
  } catch {
    return errorResponse(400);
  } finally {
    reader.releaseLock();
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("email" in body) ||
    typeof body.email !== "string"
  ) {
    return errorResponse(400);
  }

  const email = body.email.trim();
  // Validación básica; Spring Boot conserva la validación y normalización final.
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    return errorResponse(400);
  }
  // \s no incluye todos los controles, como NUL o DEL.
  for (const character of email) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      return errorResponse(400);
    }
  }
  return email;
}

function backendEndpoint(): URL | null {
  try {
    const base = new URL(process.env.BACKEND_URL ?? "");
    if (
      !["http:", "https:"].includes(base.protocol) ||
      (base.protocol === "http:" &&
        (process.env.NODE_ENV === "production" ||
          !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) ||
      base.username ||
      base.password ||
      base.pathname !== "/" ||
      base.search ||
      base.hash
    ) {
      return null;
    }
    return new URL("/api/usuarios/identificacion", base);
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  const rejection = await checkRateLimit(request, RATE_LIMIT_ENDPOINTS.identification);
  if (rejection) return rejection;

  const email = await readEmail(request);
  if (email instanceof Response) return email;

  const endpoint = backendEndpoint();
  if (!endpoint) return errorResponse(503);
  const serviceSecret = process.env.BFF_SERVICE_SECRET;
  if (!serviceSecret?.trim()) return errorResponse(503);

  const signal = AbortSignal.timeout(BACKEND_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Service-Token": serviceSecret,
      },
      body: JSON.stringify({ email }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal,
    });
  } catch {
    return errorResponse(signal.aborted ? 504 : 502);
  }

  if (upstream.status === 429 || upstream.status === 503) {
    const error = await readBackendQuotaError(upstream, signal, true);
    return "codigo" in error ? backendQuotaErrorResponse(error) : errorResponse(error.status);
  }

  // Fuera de los errores de cuota no se leen cuerpos ni se copian headers.
  discardBody(upstream);

  if (upstream.status === 204) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (
    upstream.status === 400 ||
    upstream.status === 413 ||
    upstream.status === 415
  ) {
    return errorResponse(upstream.status);
  }

  // Un 401/403 del backend es un rechazo de la credencial técnica, no del email.
  if (upstream.status === 401 || upstream.status === 403) {
    return errorResponse(502);
  }

  // Incluye errores 5xx, redirecciones y respuestas exitosas fuera del contrato.
  return errorResponse(502);
}
