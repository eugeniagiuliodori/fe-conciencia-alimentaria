// src/services/publicaciones-service.ts

import "server-only";

import {
  publications,
} from "@/data/publications";
import type {
  Publication,
} from "@/data/publications";
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

  if (
    !Number.isInteger(offset) ||
    offset < 0
  ) {
    throw new Error(
      "offset debe ser un entero mayor o igual a 0.",
    );
  }

  if (
    !Number.isInteger(limit) ||
    limit < 1
  ) {
    throw new Error(
      "limit debe ser un entero positivo.",
    );
  }

  const total = publications.length;

  return {
    publicaciones: publications.slice(
      offset,
      offset + limit,
    ),
    offset,
    limit,
    total,
  };
}
