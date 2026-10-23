import "server-only";

const MAX_UPSTREAM_BODY_BYTES = 4096;
// Tope defensivo de la cabecera pública, no de la ventana configurable del backend.
const MAX_GLOBAL_RETRY_AFTER_SECONDS = 24 * 60 * 60;

export type BackendQuotaError =
  | { status: 429; codigo: "CUOTA_GLOBAL_SUPERADA" | "DEMASIADAS_SOLICITUDES"; retryAfter?: string }
  | { status: 503; codigo: "CONTROL_CUOTA_GLOBAL_NO_DISPONIBLE" };

const quotaMessages = {
  CUOTA_GLOBAL_SUPERADA: "Cuota global superada. Intentá nuevamente más tarde.",
  CONTROL_CUOTA_GLOBAL_NO_DISPONIBLE: "No se pudo comprobar la cuota global. Intentá más tarde.",
  DEMASIADAS_SOLICITUDES: "Demasiadas solicitudes. Intentá nuevamente más tarde.",
} as const;

export function discardBody(response: Response): void {
  void response.body?.cancel().catch(() => {});
}

// Lector acotado compartido por las respuestas de sesión y los errores de cuota.
export async function readBackendJson(response: Response): Promise<unknown> {
  if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    discardBody(response);
    throw new Error("Invalid upstream content type");
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing upstream body");
  const bytes = new Uint8Array(MAX_UPSTREAM_BODY_BYTES);
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > MAX_UPSTREAM_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new Error("Upstream body too large");
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
  } finally {
    reader.releaseLock();
  }
}

function validRetryAfter(value: string | null, maximum: number): string | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds > 0 && seconds <= maximum
    ? String(seconds)
    : undefined;
}

export async function readBackendQuotaError(
  response: Response,
  signal: AbortSignal,
  allowLocalQuota = false,
): Promise<BackendQuotaError | { status: 502 | 504 }> {
  try {
    const body = await readBackendJson(response);
    if (
      typeof body !== "object" || body === null || Array.isArray(body) ||
      Object.keys(body).length !== 2 ||
      !("codigo" in body) || typeof body.codigo !== "string" ||
      !("mensaje" in body) || typeof body.mensaje !== "string"
    ) {
      return { status: 502 };
    }
    if (response.status === 429 && body.codigo === "CUOTA_GLOBAL_SUPERADA") {
      return {
        status: 429,
        codigo: body.codigo,
        retryAfter: validRetryAfter(response.headers.get("retry-after"), MAX_GLOBAL_RETRY_AFTER_SECONDS),
      };
    }
    if (response.status === 503 && body.codigo === "CONTROL_CUOTA_GLOBAL_NO_DISPONIBLE") {
      return { status: 503, codigo: body.codigo };
    }
    if (allowLocalQuota && response.status === 429 && body.codigo === "DEMASIADAS_SOLICITUDES") {
      return {
        status: 429,
        codigo: body.codigo,
        // Conserva la validación preexistente de Retry-After para la cuota local.
        retryAfter: validRetryAfter(response.headers.get("retry-after"), Number.MAX_SAFE_INTEGER),
      };
    }
    return { status: 502 };
  } catch {
    return { status: signal.aborted ? 504 : 502 };
  }
}

export function backendQuotaErrorResponse(error: BackendQuotaError): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (error.status === 429 && error.retryAfter) headers.set("Retry-After", error.retryAfter);
  return Response.json(
    { codigo: error.codigo, mensaje: quotaMessages[error.codigo] },
    { status: error.status, headers },
  );
}
