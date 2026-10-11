import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const RAW_PATH = path.resolve("data/raw/geografia/geografia-source.json");
const OUTPUT_DIR = path.resolve("data/normalized/geografia");
const TEMP_DIR = path.resolve("data/normalized/geografia.__tmp__");
const SCHEMA_VERSION = 1;

type JsonObject = Record<string, unknown>;

type CiudadNormalizada = string;

type DivisionNormalizada = {
  id: string;
  nombre: string;
  codigo: string | null;
  tipo: string | null;
  ciudades: CiudadNormalizada[];
};

type PaisNormalizado = {
  schemaVersion: number;
  sourceSha256: string;
  pais: {
    id: string;
    nombre: string;
    codigoIso2: string | null;
  };
  divisiones: DivisionNormalizada[];
};

type PaisIndice = {
  id: string;
  nombre: string;
  codigoIso2: string | null;
  archivo: string;
  cantidadDivisiones: number;
  cantidadCiudades: number;
};

type PaisFuente = {
  nombre: string;
  codigoIso2: string | null;
  divisiones: DivisionFuente[];
};

type DivisionFuente = {
  nombre: string;
  codigo: string | null;
  tipo: string | null;
  ciudades: string[];
};

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  const slug = normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error(`No se pudo generar un identificador para: ${JSON.stringify(value)}`);
  }

  return slug;
}

function firstString(record: JsonObject, keys: string[]): string | null {
  for (const key of keys) {
    const value = asNonEmptyString(record[key]);
    if (value) return value;
  }
  return null;
}

function extractIso2(record: JsonObject): string | null {
  const candidate = firstString(record, [
    "iso2",
    "iso_2",
    "isoCode",
    "countryCode",
    "country_code",
  ]);

  if (!candidate || !/^[A-Za-z]{2}$/.test(candidate)) return null;
  return candidate.toUpperCase();
}

function extractCities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const cities: string[] = [];

  for (const item of value) {
    if (typeof item === "string") {
      const name = asNonEmptyString(item);
      if (name) cities.push(name);
      continue;
    }

    if (isRecord(item)) {
      const name = firstString(item, ["name", "nombre", "city", "city_name"]);
      if (name) cities.push(name);
    }
  }

  return dedupeStrings(cities).sort(compareNames);
}

function extractDivisionsFromMap(states: JsonObject): DivisionFuente[] {
  const result: DivisionFuente[] = [];

  for (const [rawName, rawCities] of Object.entries(states)) {
    const nombre = asNonEmptyString(rawName);
    if (!nombre) continue;

    result.push({
      nombre,
      codigo: null,
      tipo: null,
      ciudades: extractCities(rawCities),
    });
  }

  return result;
}

function extractDivisionsFromArray(states: unknown[]): DivisionFuente[] {
  const result: DivisionFuente[] = [];

  for (const rawState of states) {
    if (!isRecord(rawState)) continue;

    const nombre = firstString(rawState, ["name", "nombre", "state_name"]);
    if (!nombre) continue;

    result.push({
      nombre,
      codigo: firstString(rawState, ["code", "state_code", "iso3166_2"]),
      tipo: firstString(rawState, ["type_es", "type", "tipo"]),
      ciudades: extractCities(rawState.cities ?? rawState.ciudades),
    });
  }

  return result;
}

function extractDivisions(country: JsonObject): DivisionFuente[] {
  const rawStates =
    country.states ??
    country.divisions ??
    country.divisiones ??
    country.provinces ??
    country.provincias;

  if (Array.isArray(rawStates)) {
    return extractDivisionsFromArray(rawStates);
  }

  if (isRecord(rawStates)) {
    return extractDivisionsFromMap(rawStates);
  }

  return [];
}

function adaptCountry(rawCountry: unknown, fallbackName?: string): PaisFuente | null {
  if (!isRecord(rawCountry)) return null;

  const nombre =
    firstString(rawCountry, ["name_es", "nombre", "name", "country_name"]) ??
    (fallbackName ? asNonEmptyString(fallbackName) : null);

  if (!nombre) return null;

  return {
    nombre,
    codigoIso2: extractIso2(rawCountry),
    divisiones: extractDivisions(rawCountry),
  };
}

function adaptSource(root: unknown): PaisFuente[] {
  if (Array.isArray(root)) {
    return root
      .map((country) => adaptCountry(country))
      .filter((country): country is PaisFuente => country !== null);
  }

  if (!isRecord(root)) {
    throw new Error("El JSON raíz debe ser un objeto o un array de países.");
  }

  if (Array.isArray(root.countries)) {
    return root.countries
      .map((country) => adaptCountry(country))
      .filter((country): country is PaisFuente => country !== null);
  }

  const countries: PaisFuente[] = [];

  for (const [countryKey, rawCountry] of Object.entries(root)) {
    const country = adaptCountry(rawCountry, countryKey);
    if (country) countries.push(country);
  }

  return countries;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map(normalizeText))];
}

function compareNames(a: string, b: string): number {
  return (
    a.localeCompare(b, "es", { sensitivity: "base", numeric: true }) ||
    a.localeCompare(b, "es", { numeric: true })
  );
}

function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }

  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;

  const id = `${base}-${suffix}`;
  used.add(id);
  return id;
}

function normalizeCountry(country: PaisFuente, sourceSha256: string): PaisNormalizado {
  const countryId = country.codigoIso2 ?? slugify(country.nombre);
  const usedDivisionIds = new Set<string>();

  const divisions = country.divisiones
    .map((division) => {
      const baseId = division.codigo
        ? slugify(division.codigo)
        : slugify(division.nombre);

      return {
        id: uniqueId(baseId, usedDivisionIds),
        nombre: normalizeText(division.nombre),
        codigo: division.codigo ? normalizeText(division.codigo) : null,
        tipo: division.tipo ? normalizeText(division.tipo) : null,
        ciudades: dedupeStrings(division.ciudades).sort(compareNames),
      } satisfies DivisionNormalizada;
    })
    .sort((a, b) => compareNames(a.nombre, b.nombre));

  return {
    schemaVersion: SCHEMA_VERSION,
    sourceSha256,
    pais: {
      id: countryId,
      nombre: normalizeText(country.nombre),
      codigoIso2: country.codigoIso2,
    },
    divisiones: divisions,
  };
}

function validateNormalizedCountries(countries: PaisNormalizado[]): void {
  if (countries.length === 0) {
    throw new Error("La fuente no produjo ningún país normalizable.");
  }

  const countryIds = new Set<string>();

  for (const country of countries) {
    if (countryIds.has(country.pais.id)) {
      throw new Error(`ID de país duplicado: ${country.pais.id}`);
    }
    countryIds.add(country.pais.id);

    const divisionIds = new Set<string>();
    for (const division of country.divisiones) {
      if (divisionIds.has(division.id)) {
        throw new Error(
          `ID de división duplicado en ${country.pais.nombre}: ${division.id}`,
        );
      }
      divisionIds.add(division.id);
    }
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const rawText = await readFile(RAW_PATH, "utf8");
  const sourceSha256 = createHash("sha256").update(rawText, "utf8").digest("hex");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch (error) {
    throw new Error(
      `El archivo ${RAW_PATH} no contiene JSON válido.`,
      { cause: error },
    );
  }

  const adaptedCountries = adaptSource(parsed);

  const normalizedCountries = adaptedCountries
    .map((country) => normalizeCountry(country, sourceSha256))
    .sort((a, b) => compareNames(a.pais.nombre, b.pais.nombre));

  validateNormalizedCountries(normalizedCountries);

  await rm(TEMP_DIR, { recursive: true, force: true });
  await mkdir(path.join(TEMP_DIR, "countries"), { recursive: true });

  const index: PaisIndice[] = [];

  for (const country of normalizedCountries) {
    const fileName = `${country.pais.id}.json`;
    const relativeFile = `countries/${fileName}`;

    await writeJson(path.join(TEMP_DIR, relativeFile), country);

    index.push({
      id: country.pais.id,
      nombre: country.pais.nombre,
      codigoIso2: country.pais.codigoIso2,
      archivo: relativeFile,
      cantidadDivisiones: country.divisiones.length,
      cantidadCiudades: country.divisiones.reduce(
        (total, division) => total + division.ciudades.length,
        0,
      ),
    });
  }

  await writeJson(path.join(TEMP_DIR, "countries.json"), {
    schemaVersion: SCHEMA_VERSION,
    sourceSha256,
    paises: index,
  });

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await rename(TEMP_DIR, OUTPUT_DIR);

  const totalCities = index.reduce(
    (total, country) => total + country.cantidadCiudades,
    0,
  );

  console.log(`Geografía normalizada correctamente.`);
  console.log(`Países: ${index.length}`);
  console.log(`Ciudades: ${totalCities}`);
  console.log(`Salida: ${OUTPUT_DIR}`);
  console.log(`SHA-256 fuente: ${sourceSha256}`);
}

main().catch((error: unknown) => {
  console.error("Error normalizando geografía:");
  console.error(error);
  process.exitCode = 1;
});
