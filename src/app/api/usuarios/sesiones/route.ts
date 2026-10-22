import { NextRequest, NextResponse } from "next/server";
import { iniciarSesionDeclarativa } from "@/services/sesiones-declarativas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;

const errors = {
  400: { codigo: "SOLICITUD_INVALIDA", mensaje: "Datos de inicio de sesión inválidos." },
  404: { codigo: "CORREO_NO_REGISTRADO", mensaje: "El correo no está registrado. Primero debe registrarse." },
  413: { codigo: "SOLICITUD_DEMASIADO_GRANDE", mensaje: "La solicitud supera el tamaño permitido." },
  415: { codigo: "TIPO_CONTENIDO_NO_ADMITIDO", mensaje: "Tipo de contenido no admitido." },
  502: { codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "No se pudo confirmar el inicio de sesión. Intentá nuevamente más tarde." },
  503: { codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "El inicio de sesión no está disponible en este momento." },
  504: { codigo: "TIEMPO_DE_ESPERA_AGOTADO", mensaje: "No se pudo confirmar la operación a tiempo. Intentá más tarde." },
} as const;

function errorResponse(status: keyof typeof errors): Response {
  return Response.json(errors[status], {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function readEmail(request: Request): Promise<string | Response> {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim();
  if (mediaType?.toLowerCase() !== "application/json") return errorResponse(415);

  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) return errorResponse(400);
    if (Number(contentLength) > MAX_BODY_BYTES) return errorResponse(413);
  }

  const reader = request.body?.getReader();
  if (!reader) return errorResponse(400);
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
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
  } catch {
    return errorResponse(400);
  } finally {
    reader.releaseLock();
  }

  if (
    typeof body !== "object" || body === null || Array.isArray(body) ||
    Object.keys(body).length !== 1 || !("email" in body) || typeof body.email !== "string"
  ) {
    return errorResponse(400);
  }

  const email = body.email.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(email)) return errorResponse(400);
  for (const character of email) {
    const code = character.charCodeAt(0);
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return errorResponse(400);
  }
  return email;
}

export async function POST(request: NextRequest): Promise<Response> {
  const email = await readEmail(request);
  if (email instanceof Response) return email;

  const result = await iniciarSesionDeclarativa(email);
  if (result.status === 201) {
    try {
      const response = new NextResponse(null, {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      });
      response.cookies.set("ca_sesion", result.sesionId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production" || request.nextUrl.protocol === "https:",
      });
      return response;
    } catch {
      return errorResponse(502);
    }
  }
  return errorResponse(result.status);
}
