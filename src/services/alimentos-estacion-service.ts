import "server-only";

import alimentosPorEstacion from "@/data/alimentos_estacion.json";
import {
  obtenerRangoElementos,
} from "@/services/shared/colecciones";
import type {
  Alimento,
  ConsultaRangoAlimentosEstacion,
  Estacion,
  ResultadoRangoAlimentosEstacion,
} from "@/types/alimentosestacion";

export function esEstacion(
  value: string | null,
): value is Estacion {
  return (
    value !== null &&
    Object.prototype.hasOwnProperty.call(
      alimentosPorEstacion,
      value,
    )
  );
}

export async function obtenerAlimentosPorEstacion(
  estacion: Estacion,
): Promise<Alimento[]> {
  return Object.values(
    alimentosPorEstacion[estacion],
  ) as Alimento[];
}

export async function obtenerRangoAlimentosEstacion(
  consulta: ConsultaRangoAlimentosEstacion,
): Promise<ResultadoRangoAlimentosEstacion> {
  const {
    estacion,
    offset,
    limit,
  } = consulta;

  const alimentos =
    await obtenerAlimentosPorEstacion(
      estacion,
    );

  const rango =
    obtenerRangoElementos(
      alimentos,
      offset,
      limit,
    );

  return {
    alimentos: rango.elementos,
    offset: rango.offset,
    limit: rango.limit,
    total: rango.total,
  };
}
