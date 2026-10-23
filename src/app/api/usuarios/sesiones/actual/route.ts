import { NextRequest, NextResponse } from "next/server";
import { cerrarSesionDeclarativa } from "@/services/sesiones-declarativas";
import { checkRateLimit } from "@/features/rate-limiting/guard";
import { RATE_LIMIT_ENDPOINTS } from "@/features/rate-limiting/limit";
import { backendQuotaErrorResponse } from "@/services/shared/backend-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errors = {
  400: { codigo: "SOLICITUD_INVALIDA", mensaje: "Datos de cierre de sesión inválidos." },
  502: { codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "No se pudo confirmar el cierre de sesión. Intentá nuevamente más tarde." },
  503: { codigo: "SERVICIO_NO_DISPONIBLE", mensaje: "El cierre de sesión no está disponible en este momento." },
  504: { codigo: "TIEMPO_DE_ESPERA_AGOTADO", mensaje: "No se pudo confirmar la operación a tiempo. Intentá más tarde." },
} as const;

function errorResponse(status: keyof typeof errors): Response {
  return Response.json(errors[status], {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const rejection = await checkRateLimit(request, RATE_LIMIT_ENDPOINTS.sessionEnd);
  if (rejection) return rejection;

  const sesionId = request.cookies.get("ca_sesion")?.value;
  if (sesionId === undefined) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  const result = await cerrarSesionDeclarativa(sesionId);
  if ("codigo" in result) return backendQuotaErrorResponse(result);
  if (result.status !== 204) return errorResponse(result.status);

  try {
    const response = new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
    response.cookies.delete({
      name: "ca_sesion",
      path: "/",
      secure: process.env.NODE_ENV === "production" || request.nextUrl.protocol === "https:",
    });
    return response;
  } catch {
    return errorResponse(502);
  }
}
