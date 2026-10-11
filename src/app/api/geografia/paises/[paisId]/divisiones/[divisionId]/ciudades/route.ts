import { NextResponse } from "next/server";

import { obtenerCiudades } from "@/services/geografia.service";

type RouteContext = {
  params: Promise<{
    paisId: string;
    divisionId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const {
      paisId,
      divisionId,
    } = await context.params;

    const ciudades =
      await obtenerCiudades(
        paisId,
        divisionId,
      );

    if (ciudades === null) {
      return NextResponse.json(
        {
          error:
            "No se encontró el país o la división administrativa indicada.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json(
      ciudades,
    );
  } catch (error) {
    console.error(
      "Error al obtener ciudades:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No se pudieron obtener las ciudades.",
      },
      {
        status: 500,
      },
    );
  }
}