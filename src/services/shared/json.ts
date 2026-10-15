import "server-only";

import {
  readFile,
} from "node:fs/promises";

export type ValidadorJson<T> = (
  value: unknown,
) => asserts value is T;

export async function leerJsonValidado<T>(
  archivoPath: string,
  validar: ValidadorJson<T>,
): Promise<T> {
  const contenido =
    await readFile(
      archivoPath,
      "utf8",
    );

  const parsed: unknown =
    JSON.parse(contenido);

  validar(parsed);

  return parsed;
}
