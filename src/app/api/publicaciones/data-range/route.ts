// src/app/api/publicaciones/data-range/route.ts

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  obtenerRangoPublicaciones,
} from "@/services/publicaciones.service";
import type {
  ResultadoRangoPublicaciones,
} from "@/types/publicaciones";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function enteroNoNegativo(
  value: string | null,
): number | null {
  if (value === null) {
    return null;
  }

  const numero = Number(value);

  if (
    !Number.isInteger(numero) ||
    numero < 0
  ) {
    return Number.NaN;
  }

  return numero;
}

function enteroPositivo(
  value: string | null,
): number | null {
  if (value === null) {
    return null;
  }

  const numero = Number(value);

  if (
    !Number.isInteger(numero) ||
    numero < 1
  ) {
    return Number.NaN;
  }

  return numero;
}

function respuestaSinCache(
  body:
    | ResultadoRangoPublicaciones
    | { error: string },
  status = 200,
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate",
      },
    },
  );
}

export async function GET(
  request: NextRequest,
) {
  try {
    const searchParams =
      request.nextUrl.searchParams;

    const offset =
      enteroNoNegativo(
        searchParams.get("offset"),
      );

    const limit =
      enteroPositivo(
        searchParams.get("limit"),
      );

    if (
      offset === null ||
      limit === null ||
      Number.isNaN(offset) ||
      Number.isNaN(limit) ||
      limit > 100
    ) {
      return respuestaSinCache(
        {
          error:
            "offset debe ser un entero mayor o igual a 0 y limit un entero entre 1 y 100.",
        },
        400,
      );
    }

    const resultado =
      await obtenerRangoPublicaciones({
        offset,
        limit,
      });

    return respuestaSinCache(
      resultado,
    );
  } catch (error) {
    console.error(
      "Error al obtener rango de publicaciones:",
      error,
    );

    return respuestaSinCache(
      {
        error:
          "No se pudo obtener el rango de publicaciones.",
      },
      500,
    );
  }
}