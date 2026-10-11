// app/api/negocios/route.ts

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { obtenerNegociosPublicos } from "@/services/negocios.service";
import type { EstadoProductosOrganicos } from "@/types/negocios";

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
        return NextResponse.json(
          {
            error:
              "El estado de productos orgánicos indicado no es válido.",
          },
          {
            status: 400,
          },
        );
      }

      estadoProductosOrganicos =
        estadoOrganicosParam;
    }

    const negocios =
      await obtenerNegociosPublicos({
        divisionId,
        ciudad,
        estadoProductosOrganicos,
      });

    return NextResponse.json(
      negocios,
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error(
      "Error al obtener negocios naturistas:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No se pudieron obtener los negocios naturistas.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      },
    );
  }
}