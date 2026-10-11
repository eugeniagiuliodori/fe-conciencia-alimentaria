import { NextResponse } from "next/server";

import { obtenerDivisiones } from "@/services/geografia.service";

type RouteContext = {
  params: Promise<{
    paisId: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { paisId } =
      await context.params;

    const divisiones =
      await obtenerDivisiones(paisId);

    if (divisiones === null) {
      return NextResponse.json(
        {
          error:
            "El país solicitado no existe.",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json(divisiones);
  } catch (error) {
    console.error(
      "Error al obtener divisiones:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No se pudieron obtener las divisiones administrativas.",
      },
      {
        status: 500,
      },
    );
  }
}