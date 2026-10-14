import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  obtenerRangoNegociosPublicos,
} from "@/services/negocios.service";
import type {
  EstadoProductosOrganicos,
  FiltrosNegocios,
  ResultadoRangoNegocios,
} from "@/types/negocios";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ESTADOS_ORGANICOS: EstadoProductosOrganicos[] = [
  "todos",
  "algunos",
  "ninguno",
  "no_verificado",
];

function esEstadoProductosOrganicos(
  value: string,
): value is EstadoProductosOrganicos {
  return ESTADOS_ORGANICOS.includes(
    value as EstadoProductosOrganicos,
  );
}

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
    | ResultadoRangoNegocios
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

    const divisionId =
      searchParams.get("divisionId") ??
      undefined;

    const ciudad =
      searchParams.get("ciudad") ??
      undefined;

    const estadoOrganicosParam =
      searchParams.get(
        "estadoProductosOrganicos",
      );

    let estadoProductosOrganicos:
      | EstadoProductosOrganicos
      | undefined;

    if (estadoOrganicosParam !== null) {
      if (
        !esEstadoProductosOrganicos(
          estadoOrganicosParam,
        )
      ) {
        return respuestaSinCache(
          {
            error:
              "El estado de productos orgánicos indicado no es válido.",
          },
          400,
        );
      }

      estadoProductosOrganicos =
        estadoOrganicosParam;
    }

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

    const filtros: FiltrosNegocios = {
      divisionId,
      ciudad,
      estadoProductosOrganicos,
    };

    const resultado =
      await obtenerRangoNegociosPublicos({
        ...filtros,
        offset,
        limit,
      });

    return respuestaSinCache(
      resultado,
    );
  } catch (error) {
    console.error(
      "Error al obtener rango de negocios naturistas:",
      error,
    );

    return respuestaSinCache(
      {
        error:
          "No se pudo obtener el rango de negocios naturistas.",
      },
      500,
    );
  }
}
