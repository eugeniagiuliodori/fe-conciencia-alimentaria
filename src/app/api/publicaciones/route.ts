// src/app/api/publicaciones/route.ts

import {
  NextResponse,
} from "next/server";

import {
  obtenerPublicaciones,
} from "@/services/publicaciones.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const publicaciones =
      await obtenerPublicaciones();

    return NextResponse.json(
      publicaciones,
      {
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error) {
    console.error(
      "Error al obtener publicaciones:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "No se pudieron obtener las publicaciones.",
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