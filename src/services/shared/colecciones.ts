import "server-only";

export type ResultadoRangoElementos<T> = {
  elementos: T[];
  offset: number;
  limit: number;
  total: number;
};

function validarRango(
  offset: number,
  limit: number,
): void {
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
}

export function obtenerRangoElementos<T>(
  elementos: readonly T[],
  offset: number,
  limit: number,
): ResultadoRangoElementos<T> {
  validarRango(
    offset,
    limit,
  );

  return {
    elementos: elementos.slice(
      offset,
      offset + limit,
    ),
    offset,
    limit,
    total: elementos.length,
  };
}
