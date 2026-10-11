import { NextResponse } from "next/server";

import { obtenerPaises } from "@/services/geografia.service";

export async function GET() {
  try {
    const paises = await obtenerPaises();

    return NextResponse.json(paises);
  } catch (error) {
    console.error(
      "Error al obtener países:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No se pudieron obtener los países.",
      },
      {
        status: 500,
      },
    );
  }
}