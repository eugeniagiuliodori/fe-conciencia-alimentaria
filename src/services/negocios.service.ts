// src/server/negocios.ts

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  EstadoProductosOrganicos,
  NegocioNaturista,
  NegociosNaturistasDataset,
  NegocioPublico
} from "@/types/negocios";

const NEGOCIOS_PATH = path.resolve(
  process.cwd(),
  "data/normalized/negocios/negocios-naturistas-argentina.json",
);

type FiltrosNegocios = {
  divisionId?: string;
  ciudad?: string;
  estadoProductosOrganicos?: EstadoProductosOrganicos;
};


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

  if (dataset.pais?.id !== "AR") {
    throw new Error(
      "El dataset de negocios esperado debe corresponder a Argentina.",
    );
  }

  if (!Array.isArray(dataset.negocios)) {
    throw new Error(
      "El dataset normalizado no contiene negocios[].",
    );
  }
}

async function leerDataset(): Promise<NegociosNaturistasDataset> {
  const contenido = await readFile(
    NEGOCIOS_PATH,
    "utf8",
  );

  const parsed: unknown = JSON.parse(contenido);

  validarDataset(parsed);

  return parsed;
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
          ubicacion.direccion.divisionId ===
          filtros.divisionId,
      );

    if (!perteneceDivision) {
      return false;
    }
  }

  if (filtros.ciudad) {
    const ciudadBuscada =
      filtros.ciudad.toLocaleLowerCase("es-AR");

    const perteneceCiudad =
      negocio.ubicaciones.some(
        (ubicacion) =>
          ubicacion.direccion.ciudad
            ?.toLocaleLowerCase("es-AR") ===
          ciudadBuscada,
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
  const {
    fuentes: _fuentes,
    observaciones: _observaciones,
    ...publico
  } = negocio;

  return publico;
}

export async function obtenerNegocios(
  filtros: FiltrosNegocios = {},
): Promise<NegocioNaturista[]> {
  const dataset = await leerDataset();

  return dataset.negocios.filter((negocio) =>
    coincideConFiltros(negocio, filtros),
  );
}

export async function obtenerNegocioPorId(
  id: string,
): Promise<NegocioNaturista | null> {
  const dataset = await leerDataset();

  return (
    dataset.negocios.find(
      (negocio) => negocio.id === id,
    ) ?? null
  );
}

export async function obtenerNegociosPublicos(
  filtros: FiltrosNegocios = {},
): Promise<NegocioPublico[]> {
  const negocios = await obtenerNegocios(filtros);

  return negocios.map(convertirANegocioPublico);
}

export async function obtenerNegocioPublicoPorId(
  id: string,
): Promise<NegocioPublico | null> {
  const negocio = await obtenerNegocioPorId(id);

  if (!negocio) {
    return null;
  }

  return convertirANegocioPublico(negocio);
}