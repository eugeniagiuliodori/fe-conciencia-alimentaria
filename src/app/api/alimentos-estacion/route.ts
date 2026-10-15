import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  esEstacion,
  obtenerAlimentosPorEstacion,
} from "@/services/alimentos-estacion-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function respuestaSinCache(
  body: unknown,
  status = 200,
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate",
    },
  });
}

export async function GET(
  request: NextRequest,
) {
  try {
    const estacion =
      request.nextUrl.searchParams.get(
        "estacion",
      );

    if (!esEstacion(estacion)) {
      return respuestaSinCache(
        {
          error:
            "La estación indicada no es válida.",
        },
        400,
      );
    }

    const alimentos =
      await obtenerAlimentosPorEstacion(
        estacion,
      );

    return respuestaSinCache(alimentos);
  } catch (error) {
    console.error(
      "Error al obtener alimentos de estación:",
      error,
    );

    return respuestaSinCache(
      {
        error:
          "No se pudieron obtener los alimentos de estación.",
      },
      500,
    );
  }
}
