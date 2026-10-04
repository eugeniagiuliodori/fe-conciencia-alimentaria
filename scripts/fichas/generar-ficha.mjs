#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertNoSecret,
  createIdentity,
  fail,
  parseArgs,
  safeError,
  sha256,
  VERSION,
} from "./core.mjs";
import { generateAnalysis, validateGeminiConfig } from "./gemini.mjs";
import { retrieveDocumentWithHumanVerification } from "./browser-retrieval.mjs";
import { EMPTY_METADATA, LAYOUT_WARNING_PREFIX, textForCoverage } from "./retrieval.mjs";
import { validateFicha, validateModelResult } from "./schema.mjs";
import {
  acquireLock,
  atomicWrite,
  historyPath,
  outputPath,
  readExisting,
  writeCoverageText,
} from "./storage.mjs";

export const HELP = `Generador local y manual de fichas científicas (contrato ${VERSION}).

Uso desde la raíz del repositorio:
  node scripts/fichas/generar-ficha.mjs --fecha 2026-10-01 --url 'https://ejemplo.org/articulo'
  node --env-file=.env.local scripts/fichas/generar-ficha.mjs --fecha 2026-10-01 --url 'https://ejemplo.org/articulo' --force

Opciones:
  --fecha YYYY-MM-DD  Fecha real de la noticia web; no la fecha del estudio.
  --url URL          URL HTTP(S) absoluta, sin credenciales. Solo se recortan extremos.
  --force            Nueva revisión; conserva la anterior ante fallos. Rechaza INCLUIDO.
  --help             Muestra esta ayuda, sin red ni escritura de fichas.

Requisitos: Node.js 24 (entorno verificado: 24.15.0), npm ci.
PDF textual: pdfinfo, pdfimages y pdftotext (Poppler) disponibles en PATH.
Variables requeridas: GEMINI_API_KEY, GEMINI_MODEL (sin modelo predeterminado).
Variable opcional: FICHAS_DIR (por defecto data/fichas; relativa a la raíz o absoluta).
Verificación humana: abre Chrome temporal y espera Enter en esta terminal.
Requiere escritorio y Chrome instalado; FICHAS_BROWSER_PATH permite indicar
la ruta absoluta a otro Chrome/Chromium. Cancelar: escribir cancelar o Ctrl+C.
No usar NEXT_PUBLIC_*. Node no carga automáticamente .env.local: usar --env-file
con una ruta explícita, o exportar las variables en el entorno de la terminal.
Desde otro directorio, usar rutas absolutas al módulo y al archivo de entorno.

Salida: data/fichas/YYYY-MM/ficha_YYYY-MM-DD_<sha256>.json, siempre fuera de public/.
Cada intento de generación guarda junto al JSON un TXT del cuerpo contado,
sin abstract, referencias ni regiones auxiliares: YYYY-MM-DD-HH-mm-ss-SSS.txt (UTC).
Si no hubo texto evaluable, el TXT queda vacío. Reutilizar no crea otro TXT.
Una ficha íntegra existente se omite; ERROR se reintenta. Éxito nuevo: CREADO,
nunca PENDIENTE ni INCLUIDO. Fallos: ERROR trazable y código de salida 1;
argumentos inválidos: código 2 sin fabricar una identidad.
--force conserva revisiones y diagnósticos en el subdirectorio historial/.
Sin texto completo verificable no se solicita generación a Gemini.
Un diseño interpretado con ambigüedad se informa como aviso en terminal y ficha;
puede continuar si supera los controles de cobertura, sin promoción editorial.
No lee fuentes.tsv, no publica ni ejecuta tareas de Next.js.

Disponibilidad/modelos: https://ai.google.dev/api/models
Cuota del proyecto: https://ai.google.dev/gemini-api/docs/rate-limits
Detalles y limitaciones: docs/GENERADOR_FICHAS.md
`;

function createRecord(identity, previous, env, timestamp) {
  let model = env.GEMINI_MODEL ?? null;
  try {
    assertNoSecret(model, env.GEMINI_API_KEY);
    if (!/^(?:models\/)?[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(model ?? ""))
      model = null;
  } catch {
    model = null;
  }
  return {
    schema_version: VERSION,
    idempotency_key: identity.key,
    revision: previous?.revision ?? 1,
    estado: "ERROR",
    tuvo_error: previous?.tuvo_error ?? false,
    error_actual: null,
    intentos: (previous?.intentos ?? 0) + 1,
    creado_en: previous?.creado_en ?? timestamp,
    actualizado_en: timestamp,
    fuente: {
      fecha_noticia: identity.date,
      mes_noticia: identity.month,
      url_original: identity.originalUrl,
      url_normalizada: identity.url,
      url_resuelta: null,
      ...EMPTY_METADATA,
      autores: [],
      titulo_es: null,
      tipo_documento: null,
    },
    lectura: null,
    analisis: null,
    generacion: {
      proveedor: "GEMINI",
      modelo: model,
      prompt_version: VERSION,
      generado_en: null,
      solicitudes_ia: 0,
      tokens_entrada: null,
      tokens_salida: null,
    },
    validacion: {
      estructura_json_ok: true,
      identidad_ok: true,
      texto_completo_ok: false,
      trazabilidad_de_hallazgos_ok: false,
      coherencia_editorial_ok: false,
      apta_para_sintesis: false,
      validada_en: null,
      observaciones: [],
    },
    inclusion_mensual: null,
  };
}

/** Invocable by a future local script, without CLI side effects or TSV coupling. */
export async function generateFicha(
  { date, url, force = false },
  {
    env = process.env,
    retrieve = retrieveDocumentWithHumanVerification,
    generate = generateAnalysis,
    now = () => new Date().toISOString(),
    write = atomicWrite,
    writeText = writeCoverageText,
  } = {},
) {
  // Inputs containing the configured secret cannot be persisted without changing identity.
  assertNoSecret([date, url, env.FICHAS_DIR], env.GEMINI_API_KEY);
  const identity = createIdentity(date, url);
  const path = await outputPath(identity, env.FICHAS_DIR || "data/fichas");
  const release = await acquireLock(path);
  let previous = null;
  let existingUnreadable = false;
  const startedAt = now();
  let record = createRecord(identity, null, env, startedAt);
  let coverageText = "";
  let coverageTextPath = null;
  let textWriteAttempted = false;
  const saveCoverageText = async () => {
    textWriteAttempted = true;
    try {
      coverageTextPath = await writeText(path, coverageText, {
        timestamp: startedAt,
        secret: env.GEMINI_API_KEY,
      });
    } catch {
      fail(
        "PERSISTENCIA",
        "TXT_COBERTURA_NO_PERSISTIDO",
        "No se pudo guardar el TXT del cuerpo evaluado. Verificá permisos y espacio en la carpeta de fichas.",
      );
    }
  };
  const writeRecord = async (destination, value) => {
    validateFicha(value, identity);
    await write(destination, value, { secret: env.GEMINI_API_KEY });
  };
  try {
    try {
      const stored = await readExisting(path);
      if (stored !== null) {
        assertNoSecret(stored, env.GEMINI_API_KEY);
        previous = validateFicha(stored, identity);
      }
    } catch (error) {
      existingUnreadable = true;
      throw error;
    }
    if (previous && previous.estado !== "ERROR" && !force)
      return { status: "skipped", path, record: previous };
    record = createRecord(identity, previous, env, now());
    if (previous) await writeRecord(historyPath(path, previous), previous);
    if (force && previous?.estado === "INCLUIDO")
      fail(
        "ENTRADA",
        "INCLUIDO_NO_REGENERABLE",
        "No se puede regenerar INCLUIDO: todavía no existe el mecanismo de invalidación del resumen mensual.",
        false,
      );

    let document;
    try {
      document = await retrieve(identity.url, { now, env });
    } catch (error) {
      const partial = error?.document;
      if (partial) {
        assertNoSecret(partial, env.GEMINI_API_KEY);
        coverageText = textForCoverage(partial);
        record.fuente = {
          ...record.fuente,
          ...partial.metadata,
          url_resuelta: partial.resolvedUrl,
        };
        record.lectura = partial.reading;
        record.validacion.observaciones.push(...(partial.warnings ?? []));
      }
      throw safeError(error, "RECUPERACION");
    }
    assertNoSecret(document, env.GEMINI_API_KEY);
    coverageText = textForCoverage(document);
    if (
      !document.reading?.texto_completo_verificado ||
      sha256(document.text) !== document.reading.sha256_contenido_extraido
    )
      fail(
        "COBERTURA",
        "COBERTURA_INSUFICIENTE",
        "El recuperador no entregó texto íntegro verificable y su huella correspondiente.",
      );
    record.fuente = {
      ...record.fuente,
      ...document.metadata,
      url_resuelta: document.resolvedUrl,
    };
    record.lectura = document.reading;
    record.validacion.observaciones.push(...(document.warnings ?? []));
    record.validacion.texto_completo_ok = true;
    // Save before AI: a subsequent generation or JSON-writing failure retains the TXT.
    await saveCoverageText();
    validateGeminiConfig(env);
    let result;
    try {
      result = await generate(document, {
        env,
        generation: record.generacion,
        now,
      });
    } catch (error) {
      throw safeError(error, "GENERACION_IA");
    }
    assertNoSecret(result, env.GEMINI_API_KEY);
    validateModelResult(result, document);
    record.fuente.titulo_es = result.titulo_es;
    record.fuente.tipo_documento = result.tipo_documento;
    record.analisis = result.analisis;
    record.estado = "CREADO";
    record.revision = previous ? previous.revision + 1 : 1;
    record.actualizado_en = now();
    record.validacion.observaciones.push(
      "Estructura, identidad de fecha/URL recibidas y cobertura documental comprobadas por la aplicación. No se consultó ningún TSV.",
      "Se comprobó existencia de localizadores de hallazgos, no que cada afirmación o cifra esté sustentada por ellos.",
      "Pendientes revisión de fidelidad científica, magnitudes, causalidad, contradicciones y coherencia editorial. No apta todavía para síntesis.",
    );
    await writeRecord(path, record);
    return { status: "created", path, record, coverageTextPath };
  } catch (error) {
    let diagnostic = safeError(error);
    if (!textWriteAttempted) {
      try {
        await saveCoverageText();
      } catch (textError) {
        diagnostic = safeError(textError);
      }
    }
    record.estado = "ERROR";
    record.revision = previous?.revision ?? 1;
    record.analisis = null;
    record.tuvo_error = true;
    record.actualizado_en = now();
    record.error_actual = {
      etapa: diagnostic.stage,
      codigo: diagnostic.code,
      mensaje: diagnostic.message,
      ocurrido_en: record.actualizado_en,
      reintentable: diagnostic.retryable,
    };
    record.validacion.observaciones = [
      ...record.validacion.observaciones.filter((note) => note.startsWith(LAYOUT_WARNING_PREFIX)),
      "Ejecución fallida; no constituye una ficha científica apta para síntesis.",
    ];
    const preserve = previous && previous.estado !== "ERROR";
    const errorPath =
      preserve || existingUnreadable
        ? historyPath(path, record, "error")
        : path;
    try {
      await writeRecord(errorPath, record);
      if (preserve) {
        // The failed attempt is ERROR in history. The previously valid analysis retains
        // its state/revision/generation; only historical counters and audit time change.
        await writeRecord(path, {
          ...previous,
          intentos: record.intentos,
          tuvo_error: true,
          actualizado_en: record.actualizado_en,
        });
      }
    } catch {
      fail(
        "PERSISTENCIA",
        "ERROR_NO_PERSISTIDO",
        `No se pudo completar la persistencia del diagnóstico. Verificá permisos y espacio; cualquier revisión válida anterior se conserva. Puede haber un diagnóstico ya escrito en historial/.${coverageTextPath ? ` TXT del cuerpo evaluado: ${coverageTextPath}` : ""}`,
      );
    }
    return {
      status: "error",
      path: errorPath,
      preservedPath: preserve || existingUnreadable ? path : null,
      record,
      error: diagnostic,
      coverageTextPath,
    };
  } finally {
    await release();
  }
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
    const result = await generateFicha(options, { env, ...dependencies });
    const textOutput = result.coverageTextPath
      ? `\nTXT del cuerpo evaluado: ${result.coverageTextPath}` : "";
    assertNoSecret(textOutput, env.GEMINI_API_KEY);
    for (const observation of result.record.validacion.observaciones)
      if (observation.startsWith(LAYOUT_WARNING_PREFIX)) stderr(observation);
    if (result.status === "error") {
      stderr(
        `${result.error.code}: ${result.error.message}\nDiagnóstico ERROR: ${result.path}${result.preservedPath ? `\nArchivo anterior conservado: ${result.preservedPath}` : ""}${textOutput}`,
      );
      return 1;
    }
    stdout(
      `${result.status === "skipped" ? "Ficha íntegra existente; sin nueva solicitud a IA" : "Ficha CREADO; pendiente de revisión editorial"}: ${result.path}${textOutput}`,
    );
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
