// src/services/negocios.service.ts

import "server-only";

import path from "node:path";

import {
  obtenerRangoElementos,
} from "@/services/shared/colecciones";
import {
  leerJsonValidado,
} from "@/services/shared/json";
import type {
  ConsultaRangoNegocios,
  FiltrosNegocios,
  NegocioNaturista,
  NegociosNaturistasDataset,
  NegocioPublico,
  ResultadoRangoNegocios,
} from "@/types/negocios";

const NEGOCIOS_PATH = path.resolve(
  process.cwd(),
  "data/normalized/negocios/negocios-naturistas-argentina.json",
);

function validarDataset(
  value: unknown,
): asserts value is NegociosNaturistasDataset {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      "El archivo normalizado de negocios no contiene un objeto válido.",
    );
  }

  const dataset =
    value as Partial<NegociosNaturistasDataset>;

  if (dataset.schemaVersion !== 1) {
    throw new Error(
      `Versión de esquema no soportada: ${String(
        dataset.schemaVersion,
      )}`,
    );
  }

  if (
    dataset.pais?.id !==
    "argentina"
  ) {
    throw new Error(
      "El dataset de negocios esperado debe corresponder a Argentina.",
    );
  }

  if (
    !Array.isArray(
      dataset.negocios,
    )
  ) {
    throw new Error(
      "El dataset normalizado no contiene negocios[].",
    );
  }
}

async function leerDataset(): Promise<NegociosNaturistasDataset> {
  return leerJsonValidado(
    NEGOCIOS_PATH,
    validarDataset,
  );
}

function coincideConFiltros(
  negocio: NegocioNaturista,
  filtros: FiltrosNegocios,
): boolean {
  if (
    filtros.estadoProductosOrganicos &&
    negocio.estadoProductosOrganicos !==
      filtros.estadoProductosOrganicos
  ) {
    return false;
  }

  if (filtros.divisionId) {
    const perteneceDivision =
      negocio.ubicaciones.some(
        (ubicacion) =>
          ubicacion.direccion
            .divisionId ===
          filtros.divisionId,
      );

    if (!perteneceDivision) {
      return false;
    }
  }

  if (filtros.ciudad) {
    const ciudadBuscada =
      filtros.ciudad.toLocaleLowerCase(
        "es-AR",
      );

    const perteneceCiudad =
      negocio.ubicaciones.some(
        (ubicacion) =>
          ubicacion.direccion.ciudad
            ?.toLocaleLowerCase(
              "es-AR",
            ) === ciudadBuscada,
      );

    if (!perteneceCiudad) {
      return false;
    }
  }

  return true;
}

function convertirANegocioPublico(
  negocio: NegocioNaturista,
): NegocioPublico {
  /* eslint-disable @typescript-eslint/no-unused-vars -- Se excluyen estos metadatos internos de la respuesta pública. */
  const {
    fuentes: _fuentes,
    observaciones:
      _observaciones,
    ...publico
  } = negocio;
  /* eslint-enable @typescript-eslint/no-unused-vars */

  return publico;
}

export async function obtenerNegocios(
  filtros: FiltrosNegocios = {},
): Promise<NegocioNaturista[]> {
  const dataset =
    await leerDataset();

  return dataset.negocios.filter(
    (negocio) =>
      coincideConFiltros(
        negocio,
        filtros,
      ),
  );
}

export async function obtenerNegocioPorId(
  id: string,
): Promise<NegocioNaturista | null> {
  const dataset =
    await leerDataset();

  return (
    dataset.negocios.find(
      (negocio) =>
        negocio.id === id,
    ) ?? null
  );
}

export async function obtenerNegociosPublicos(
  filtros: FiltrosNegocios = {},
): Promise<NegocioPublico[]> {
  const negocios =
    await obtenerNegocios(
      filtros,
    );

  return negocios.map(
    convertirANegocioPublico,
  );
}

export async function obtenerNegocioPublicoPorId(
  id: string,
): Promise<NegocioPublico | null> {
  const negocio =
    await obtenerNegocioPorId(id);

  if (!negocio) {
    return null;
  }

  return convertirANegocioPublico(
    negocio,
  );
}

export async function obtenerRangoNegociosPublicos(
  consulta: ConsultaRangoNegocios,
): Promise<ResultadoRangoNegocios> {
  const {
    offset,
    limit,
    ...filtros
  } = consulta;

  const negocios =
    await obtenerNegocios(
      filtros,
    );

  const rango =
    obtenerRangoElementos(
      negocios,
      offset,
      limit,
    );

  return {
    negocios:
      rango.elementos.map(
        convertirANegocioPublico,
      ),
    offset: rango.offset,
    limit: rango.limit,
    total: rango.total,
  };
}
