#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoSecret,
  createIdentity,
  fail,
  safeError,
  VERSION,
} from "./core.mjs";
import { generateFicha } from "./generar-ficha.mjs";
import { LAYOUT_WARNING_PREFIX } from "./retrieval.mjs";
import { validateFicha } from "./schema.mjs";
import { outputPath, readExisting } from "./storage.mjs";

export const HELP = `Procesador local y manual previo a validación editorial (contrato ${VERSION}).

Uso desde la raíz del repositorio:
  node --env-file=.env.local scripts/fichas/procesar-ficha.mjs --fecha 2026-10-02 --url 'https://ejemplo.org/articulo'
  node --env-file=.env.local scripts/fichas/procesar-ficha.mjs --key '<SHA256_HEX_64>' --fecha 2026-10-02 --url 'https://ejemplo.org/articulo'

Opciones:
  --fecha YYYY-MM-DD  Fecha real de la noticia web; no la fecha del estudio.
  --url URL          URL HTTP(S) absoluta. La identidad solo recorta extremos.
  --key SHA256       Opcional: 64 hexadecimales coincidentes con fecha y URL.
                     Omitir si se desconoce; no pasar el texto "null".
  --help             Ayuda sin generación ni escritura de fichas.

Requisitos: los mismos del generador (Node.js 24 y npm ci; Poppler para PDF).
GEMINI_API_KEY y GEMINI_MODEL solo se necesitan cuando corresponde generar.
FICHAS_DIR es opcional: data/fichas por defecto, relativa a la raíz o absoluta,
siempre fuera de public/. Node no carga .env.local automáticamente: usar
--env-file con su ruta explícita o variables exportadas en la terminal.
Desde otro directorio, usar rutas absolutas al módulo y al archivo de entorno.
Si el editor pide verificación, el generador abre Chrome temporal: completala
y presioná Enter en esta terminal. Requiere escritorio y Chrome instalado;
FICHAS_BROWSER_PATH admite la ruta absoluta a Chrome/Chromium.
Escribir cancelar o Ctrl+C interrumpe ese paso y conserva un ERROR reintentable.

Ausente o ERROR: invoca generar-ficha sin force; éxito en CREADO.
CREADO, PENDIENTE o INCLUIDO consistentes: reutiliza sin cambios ni IA.
No realiza validación editorial, promociones ni síntesis mensual.
Muestra los avisos de interpretación ambigua del diseño guardados por el generador.
No lee fuentes.tsv ni se ejecuta desde Next.js. No admite --force.
Salida: data/fichas/YYYY-MM/ficha_YYYY-MM-DD_<sha256>.json.
Cada intento del generador guarda junto al JSON el TXT del cuerpo evaluado,
YYYY-MM-DD-HH-mm-ss-SSS.txt (UTC), también si falla; sin texto evaluable queda vacío.
Códigos: 0 éxito/reutilización/ayuda, 2 entrada inválida, 1 otros fallos.
Detalles: docs/GENERADOR_FICHAS.md
`;

function validateInput({ date, url, idempotencyKey = null }) {
  const identity = createIdentity(date, url);
  if (idempotencyKey !== null) {
    if (
      typeof idempotencyKey !== "string" ||
      idempotencyKey.length !== 64 ||
      !/^[a-f0-9]{64}$/i.test(idempotencyKey)
    )
      fail(
        "ENTRADA",
        "KEY_INVALIDA",
        "--key debe contener exactamente 64 hexadecimales; omitila si no se conoce.",
        false,
      );
    if (idempotencyKey.toLowerCase() !== identity.key)
      fail(
        "ENTRADA",
        "KEY_DISCORDANTE",
        "--key no coincide con la identidad derivada de --fecha y --url.",
        false,
      );
  }
  return identity;
}

export function parseArgs(args) {
  const options = { idempotencyKey: null, help: false };
  const fields = {
    "--fecha": "date",
    "--url": "url",
    "--key": "idempotencyKey",
  };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (
      (!Object.hasOwn(fields, argument) && argument !== "--help") ||
      seen.has(argument)
    )
      fail(
        "ENTRADA",
        "ARGUMENTOS_INVALIDOS",
        "Hay opciones desconocidas, repetidas o argumentos sueltos. Consultá --help.",
        false,
      );
    seen.add(argument);
    if (argument === "--help") options.help = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith("--"))
        fail(
          "ENTRADA",
          "ARGUMENTOS_INVALIDOS",
          "Falta el valor de --fecha, --url o --key. Consultá --help.",
          false,
        );
      options[fields[argument]] = value;
    }
  }
  if (!options.help) validateInput(options);
  return options;
}

async function readFicha(path, identity, read, secret) {
  let stored;
  try {
    stored = await read(path);
  } catch (error) {
    const diagnostic = safeError(error);
    fail(
      diagnostic.stage,
      diagnostic.code === "OPERACION_FALLIDA"
        ? "LECTURA_FALLIDA"
        : diagnostic.code,
      "No se pudo leer una ficha JSON regular en la ruta esperada. Se conserva el archivo existente para inspección; esta comprobación no escribe diagnósticos.",
      false,
    );
  }
  if (stored === null) return null;
  assertNoSecret(stored, secret);
  try {
    return validateFicha(stored, identity);
  } catch (error) {
    const diagnostic = safeError(error);
    fail(
      "VALIDACION_JSON",
      "FICHA_INCONSISTENTE",
      diagnostic.stage === "ENTRADA"
        ? "La fecha o URL almacenada en la ficha es inválida. Se conserva para inspección."
        : diagnostic.message,
      false,
    );
  }
}

/** Orchestration only: generation, auditing and locking belong to generateFicha. */
export async function processFicha(
  { date, url, idempotencyKey = null },
  { env = process.env, runGenerator = generateFicha, read = readExisting } = {},
) {
  // outputPath creates directories: reject all invalid inputs before resolving it.
  const identity = validateInput({ date, url, idempotencyKey });
  assertNoSecret([date, url, env.FICHAS_DIR], env.GEMINI_API_KEY);
  const path = await outputPath(identity, env.FICHAS_DIR || "data/fichas");
  assertNoSecret(path, env.GEMINI_API_KEY);
  const previous = await readFicha(path, identity, read, env.GEMINI_API_KEY);
  if (previous && previous.estado !== "ERROR")
    return { status: "skipped", path, record: previous, retried: false };

  // Do not acquire another lock or delete ERROR. The generator rechecks under its lock.
  const result = await runGenerator({ date, url, force: false }, { env });
  if (
    !["created", "skipped", "error"].includes(result?.status) ||
    typeof result.path !== "string" ||
    (result.path !== path &&
      !(result.status === "error" && result.preservedPath === path))
  )
    fail(
      "PERSISTENCIA",
      "RESULTADO_GENERADOR_INCONSISTENTE",
      "El generador no devolvió un resultado reconocido para la ruta de esta identidad.",
      false,
    );

  // An error may live in history if the main file changed after the initial read.
  assertNoSecret(result.path, env.GEMINI_API_KEY);
  const record = await readFicha(
    result.path,
    identity,
    read,
    env.GEMINI_API_KEY,
  );
  if (record === null)
    fail(
      "PERSISTENCIA",
      "RESULTADO_NO_PERSISTIDO",
      "No se encontró el archivo que el generador informó como persistido.",
    );
  if (
    (result.status === "created" && record.estado !== "CREADO") ||
    (result.status === "skipped" && record.estado === "ERROR") ||
    (result.status === "error" && record.estado !== "ERROR")
  )
    fail(
      "PERSISTENCIA",
      "RESULTADO_GENERADOR_INCONSISTENTE",
      "El estado persistido no corresponde al resultado del generador. Se conserva para inspección.",
      false,
    );
  return {
    status: result.status,
    path: result.path,
    record,
    retried: previous?.estado === "ERROR" && result.status !== "skipped",
    ...(result.coverageTextPath ? { coverageTextPath: result.coverageTextPath } : {}),
    ...(result.status === "error"
      ? { error: safeError(result.error), preservedPath: result.preservedPath }
      : {}),
  };
}

export async function main(
  args = process.argv.slice(2),
  {
    env = process.env,
    stdout = console.log,
    stderr = console.error,
    ...dependencies
  } = {},
) {
  try {
    const options = parseArgs(args);
    if (options.help) {
      stdout(HELP);
      return 0;
    }
    const result = await processFicha(options, { env, ...dependencies });
    let message;
    if (result.status === "error") {
      message = `${result.retried ? "Reintento fallido" : "Generación fallida"}: ${result.error.code}: ${result.error.message}\nDiagnóstico ERROR verificado: ${result.path}${result.preservedPath ? `\nArchivo anterior conservado: ${result.preservedPath}` : ""}`;
    } else {
      const action =
        result.status === "skipped"
          ? `Ficha reutilizada sin cambios (${result.record.estado}); sin nueva solicitud a IA`
          : `${result.retried ? "ERROR reintentado" : "Ficha nueva"}: CREADO; pendiente de revisión editorial`;
      message = `${action}: ${result.path}`;
    }
    if (result.coverageTextPath)
      message += `\nTXT del cuerpo evaluado: ${result.coverageTextPath}`;
    assertNoSecret(message, env.GEMINI_API_KEY);
    for (const observation of result.record.validacion.observaciones)
      if (observation.startsWith(LAYOUT_WARNING_PREFIX)) stderr(observation);
    if (result.status === "error") {
      stderr(message);
      return 1;
    }
    stdout(message);
    return 0;
  } catch (error) {
    const diagnostic = safeError(error);
    stderr(`${diagnostic.code}: ${diagnostic.message}`);
    return diagnostic.stage === "ENTRADA" ? 2 : 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await main();
