// src/services/publicaciones.service.ts

import "server-only";

import {
  publications,
} from "@/data/publications";
import type {
  Publication,
} from "@/data/publications";
import {
  obtenerRangoElementos,
} from "@/services/shared/colecciones";
import type {
  ConsultaRangoPublicaciones,
  ResultadoRangoPublicaciones,
} from "@/types/publicaciones";

export async function obtenerPublicaciones(): Promise<
  Publication[]
> {
  return [...publications];
}

export async function obtenerRangoPublicaciones(
  consulta: ConsultaRangoPublicaciones,
): Promise<ResultadoRangoPublicaciones> {
  const {
    offset,
    limit,
  } = consulta;

  const rango =
    obtenerRangoElementos(
      publications,
      offset,
      limit,
    );

  return {
    publicaciones:
      rango.elementos,
    offset: rango.offset,
    limit: rango.limit,
    total: rango.total,
  };
}
