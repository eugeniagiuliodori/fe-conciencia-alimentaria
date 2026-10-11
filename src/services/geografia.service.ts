// src/services/geografia.ts

import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  DivisionAdministrativa,
  GeografiaIndice,
  GeografiaPais,
  PaisIndice,
} from "@/types/geografia";

const GEOGRAFIA_DIR = path.resolve(
  process.cwd(),
  "data/normalized/geografia",
);

const COUNTRIES_PATH = path.join(
  GEOGRAFIA_DIR,
  "countries.json",
);

/*
 * Estos tipos representan la información que el service
 * decide entregar a las capas superiores.
 *
 * No exponemos, por ejemplo, el nombre físico del archivo:
 * "countries/AR.json".
 */
export type PaisGeografia = Pick<
  PaisIndice,
  "id" | "nombre" | "codigoIso2"
>;

export type DivisionGeografia = Pick<
  DivisionAdministrativa,
  "id" | "nombre" | "codigo" | "tipo"
>;

function validarIndice(
  value: unknown,
): asserts value is GeografiaIndice {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      "El índice geográfico normalizado no es válido.",
    );
  }

  const indice =
    value as Partial<GeografiaIndice>;

  if (indice.schemaVersion !== 1) {
    throw new Error(
      `Versión de esquema geográfico no soportada: ${String(
        indice.schemaVersion,
      )}`,
    );
  }

  if (!Array.isArray(indice.paises)) {
    throw new Error(
      "El índice geográfico no contiene paises[].",
    );
  }
}

function validarPais(
  value: unknown,
  paisId: string,
): asserts value is GeografiaPais {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `El archivo normalizado del país ${paisId} no es válido.`,
    );
  }

  const pais =
    value as Partial<GeografiaPais>;

  if (pais.schemaVersion !== 1) {
    throw new Error(
      `Versión de esquema no soportada para el país ${paisId}.`,
    );
  }

  if (!pais.pais) {
    throw new Error(
      `El archivo del país ${paisId} no contiene pais.`,
    );
  }

  if (pais.pais.id !== paisId) {
    throw new Error(
      `El archivo solicitado para ${paisId} corresponde a ${pais.pais.id}.`,
    );
  }

  if (!Array.isArray(pais.divisiones)) {
    throw new Error(
      `El archivo del país ${paisId} no contiene divisiones[].`,
    );
  }
}

async function leerIndice(): Promise<GeografiaIndice> {
  const contenido = await readFile(
    COUNTRIES_PATH,
    "utf8",
  );

  const parsed: unknown =
    JSON.parse(contenido);

  validarIndice(parsed);

  return parsed;
}

async function buscarPaisEnIndice(
  paisId: string,
): Promise<PaisIndice | null> {
  const indice = await leerIndice();

  return (
    indice.paises.find(
      (pais) => pais.id === paisId,
    ) ?? null
  );
}

function resolverArchivoPais(
  archivo: string,
): string {
  const ruta = path.resolve(
    GEOGRAFIA_DIR,
    archivo,
  );

  /*
   * Evita que un valor incorrecto del índice pueda
   * resolver una ruta fuera de data/normalized/geografia.
   */
  const relativa = path.relative(
    GEOGRAFIA_DIR,
    ruta,
  );

  if (
    relativa.startsWith("..") ||
    path.isAbsolute(relativa)
  ) {
    throw new Error(
      `Ruta de archivo geográfico inválida: ${archivo}`,
    );
  }

  return ruta;
}

async function leerPais(
  paisId: string,
): Promise<GeografiaPais | null> {
  const paisIndice =
    await buscarPaisEnIndice(paisId);

  if (!paisIndice) {
    return null;
  }

  const archivoPath =
    resolverArchivoPais(
      paisIndice.archivo,
    );

  const contenido = await readFile(
    archivoPath,
    "utf8",
  );

  const parsed: unknown =
    JSON.parse(contenido);

  validarPais(parsed, paisId);

  return parsed;
}

/*
 * PAÍSES
 */
export async function obtenerPaises(): Promise<
  PaisGeografia[]
> {
  const indice = await leerIndice();

  return indice.paises.map((pais) => ({
    id: pais.id,
    nombre: pais.nombre,
    codigoIso2: pais.codigoIso2,
  }));
}

/*
 * DIVISIONES ADMINISTRATIVAS DE UN PAÍS
 *
 * null:
 *   el país solicitado no existe.
 *
 * []:
 *   el país existe pero no tiene divisiones registradas.
 */
export async function obtenerDivisiones(
  paisId: string,
): Promise<DivisionGeografia[] | null> {
  const pais = await leerPais(paisId);

  if (!pais) {
    return null;
  }

  return pais.divisiones.map(
    (division) => ({
      id: division.id,
      nombre: division.nombre,
      codigo: division.codigo,
      tipo: division.tipo,
    }),
  );
}

/*
 * CIUDADES DE UNA DIVISIÓN
 *
 * null:
 *   no existe el país o la división.
 *
 * []:
 *   la división existe pero no tiene ciudades registradas.
 */
export async function obtenerCiudades(
  paisId: string,
  divisionId: string,
): Promise<string[] | null> {
  const pais = await leerPais(paisId);

  if (!pais) {
    return null;
  }

  const division =
    pais.divisiones.find(
      (item) =>
        item.id === divisionId,
    );

  if (!division) {
    return null;
  }

  return division.ciudades;
}