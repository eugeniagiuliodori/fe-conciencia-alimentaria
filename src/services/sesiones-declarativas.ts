import "server-only";
import { discardBody, readBackendJson, readBackendQuotaError, type BackendQuotaError } from "./shared/backend-response";

const BACKEND_TIMEOUT_MS = 5000;

export type InicioSesionResult =
  | { status: 201; sesionId: string }
  | { status: 400 | 413 | 415 | 502 | 503 | 504 }
  | { status: 404 }
  | BackendQuotaError;

export type CierreSesionResult = { status: 204 | 400 | 502 | 503 | 504 } | BackendQuotaError;

function backendEndpoint(path: string): URL | null {
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
    return new URL(path, base);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSessionResponse(value: unknown): value is { sesionId: string } {
  if (!isRecord(value) || Object.keys(value).length !== 1 || typeof value.sesionId !== "string") {
    return false;
  }
  // El identificador es opaco; solo se comprueba que sea utilizable como cabecera interna.
  return value.sesionId.trim().length > 0 && !/[\u0000-\u001f\u007f-\u009f]/.test(value.sesionId);
}

function connection(): { endpoint: URL; secret: string } | null {
  const endpoint = backendEndpoint("/api/usuarios/sesiones");
  const secret = process.env.BFF_SERVICE_SECRET;
  if (!endpoint || !secret?.trim()) return null;
  return { endpoint, secret };
}

export async function iniciarSesionDeclarativa(email: string): Promise<InicioSesionResult> {
  const target = connection();
  if (!target) return { status: 503 };

  const signal = AbortSignal.timeout(BACKEND_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(target.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Service-Token": target.secret,
      },
      body: JSON.stringify({ email }),
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal,
    });
  } catch {
    return { status: signal.aborted ? 504 : 502 };
  }

  if (upstream.status === 201) {
    try {
      const body = await readBackendJson(upstream);
      return isSessionResponse(body)
        ? { status: 201, sesionId: body.sesionId }
        : { status: 502 };
    } catch {
      return { status: signal.aborted ? 504 : 502 };
    }
  }

  if (upstream.status === 404) {
    try {
      const error: unknown = await readBackendJson(upstream);
      return { status: isRecord(error) && error.codigo === "CORREO_NO_REGISTRADO" ? 404 : 502 };
    } catch {
      return { status: signal.aborted ? 504 : 502 };
    }
  }

  if (upstream.status === 429 || upstream.status === 503) {
    return readBackendQuotaError(upstream, signal);
  }
  discardBody(upstream);
  if (upstream.status === 400 || upstream.status === 413 || upstream.status === 415) {
    return { status: upstream.status };
  }
  return { status: 502 };
}

// Solo código servidor debe suministrar sesionId.
export async function cerrarSesionDeclarativa(sesionId: string): Promise<CierreSesionResult> {
  if (!sesionId.trim() || /[\u0000-\u001f\u007f-\u009f]/.test(sesionId)) {
    return { status: 400 };
  }
  const target = connection();
  if (!target) return { status: 503 };

  const signal = AbortSignal.timeout(BACKEND_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(new URL("/api/usuarios/sesiones/actual", target.endpoint), {
      method: "DELETE",
      headers: {
        "X-Service-Token": target.secret,
        "X-Session-Id": sesionId,
      },
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal,
    });
  } catch {
    return { status: signal.aborted ? 504 : 502 };
  }

  if (upstream.status === 204) {
    const contentLength = upstream.headers.get("content-length");
    if (upstream.body !== null || (contentLength !== null && contentLength !== "0")) {
      discardBody(upstream);
      return { status: 502 };
    }
    return { status: 204 };
  }
  if (upstream.status === 429 || upstream.status === 503) {
    return readBackendQuotaError(upstream, signal);
  }
  discardBody(upstream);
  if (upstream.status === 400) return { status: 400 };
  return { status: 502 };
}
