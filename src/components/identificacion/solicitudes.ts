export type SubmissionResult = { ok: boolean; message: string };

async function errorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
    const { codigo, mensaje } = body as Record<string, unknown>;
    return typeof codigo === "string" && typeof mensaje === "string"
      ? codigo
      : null;
  } catch {
    return null;
  }
}

const unavailable = "No se pudo confirmar la operación. Intentá nuevamente más tarde.";

async function postEmail(path: string, email: string, successStatus: number, successMessage: string): Promise<SubmissionResult> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, message: unavailable };
  }

  if (response.status === successStatus) return { ok: true, message: successMessage };

  const codigo = await errorCode(response);
  if (response.status === 404 && codigo === "CORREO_NO_REGISTRADO") {
    return { ok: false, message: "El correo no está registrado. Primero registralo y luego iniciá sesión." };
  }
  if (response.status === 400 && codigo === "SOLICITUD_INVALIDA") {
    return { ok: false, message: "Revisá el correo e intentá nuevamente." };
  }
  if (response.status === 413 && codigo === "SOLICITUD_DEMASIADO_GRANDE") {
    return { ok: false, message: "La solicitud supera el tamaño permitido." };
  }
  if (response.status === 415 && codigo === "TIPO_CONTENIDO_NO_ADMITIDO") {
    return { ok: false, message: "No se pudo enviar la solicitud. Intentá nuevamente más tarde." };
  }
  if (response.status === 429) {
    return { ok: false, message: "Demasiadas solicitudes. Intentá nuevamente más tarde." };
  }
  return { ok: false, message: unavailable };
}

export function registrarCorreo(email: string): Promise<SubmissionResult> {
  return postEmail(
    "/api/usuarios/identificacion",
    email,
    204,
    "Se procesó el registro declarativo del correo. No se verificó su titularidad ni se inició sesión.",
  );
}

export function iniciarSesion(email: string): Promise<SubmissionResult> {
  return postEmail(
    "/api/usuarios/sesiones",
    email,
    201,
    "Se inició la sesión declarativa. Esto no verifica que seas titular del correo.",
  );
}

export async function cerrarSesion(): Promise<SubmissionResult> {
  let response: Response;
  try {
    response = await fetch("/api/usuarios/sesiones/actual", {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ok: false, message: "No se pudo confirmar el cierre de sesión. Intentá nuevamente más tarde." };
  }

  if (response.status === 204) {
    return { ok: true, message: "Se cerró la sesión declarativa." };
  }

  const codigo = await errorCode(response);
  if (response.status === 429 && codigo === "BFF_LIMITE_SOLICITUDES") {
    return { ok: false, message: "Demasiadas solicitudes. Intentá nuevamente más tarde." };
  }
  return { ok: false, message: "No se pudo confirmar el cierre de sesión. Intentá nuevamente más tarde." };
}
