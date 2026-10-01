import {
  createIdentity,
  fail,
  isCalendarDate,
  isHttpUrl,
  VERSION,
  wordCount,
} from "./core.mjs";

const string = { type: "string", minLength: 1 };
const boolean = { type: "boolean" };
const integer = { type: "integer", minimum: 0 };
const positive = { type: "integer", minimum: 1 };
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const array = (items, minItems = 0, maxItems) => ({
  type: "array",
  items,
  minItems,
  ...(maxItems === undefined ? {} : { maxItems }),
});
const object = (properties) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const enumeration = (values) => ({ type: "string", enum: values });
const strings = array(string);
const textOrNull = nullable(string);
const hash = { ...string, pattern: "^[a-f0-9]{64}$" };
const timestamp = {
  ...string,
  pattern:
    "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
};

export const DOCUMENT_TYPES = [
  "ARTICULO_ORIGINAL",
  "ENSAYO_CLINICO",
  "REVISION_SISTEMATICA",
  "META_ANALISIS",
  "REVISION_NARRATIVA",
  "GUIA_CONSENSO",
  "INFORME_INSTITUCIONAL",
  "OTRO",
];
export const ANALYSIS_SCHEMA = object({
  tema_principal: string,
  temas_secundarios: strings,
  palabras_clave: strings,
  pregunta_de_investigacion: textOrNull,
  objetivo: string,
  metodologia: object({
    diseno: string,
    poblacion_o_material: textOrNull,
    tamano_muestra: textOrNull,
    ambito_geografico: textOrNull,
    periodo_o_seguimiento: textOrNull,
    intervencion_o_exposicion: textOrNull,
    comparador: textOrNull,
    desenlaces_evaluados: strings,
  }),
  hallazgos: array(
    object({
      hallazgo_id: { ...string, pattern: "^H[0-9]{2,}$" },
      descripcion: string,
      magnitud_y_unidad: textOrNull,
      intervalo_confianza_o_incertidumbre: textOrNull,
      ubicacion_en_fuente: object({
        seccion: string,
        subseccion: textOrNull,
        tabla_o_figura: textOrNull,
        pagina: nullable(positive),
      }),
      interpretacion_acotada: string,
    }),
    1,
  ),
  conclusiones_de_los_autores: textOrNull,
  limitaciones: array(string, 1),
  lo_que_no_demuestra: array(string, 1),
  relevancia_para_alimentacion_y_salud: string,
  implicaciones_practicas_condicionadas: strings,
  sintesis_divulgativa: string,
  puntos_clave_para_sintesis_mensual: array(string, 2, 6),
  alertas_editoriales: strings,
});

// Gemini supplies only interpretation, translation and document classification.
export const MODEL_SCHEMA = object({
  titulo_es: textOrNull,
  tipo_documento: enumeration(DOCUMENT_TYPES),
  analisis: ANALYSIS_SCHEMA,
});

export const FICHA_SCHEMA = object({
  schema_version: enumeration([VERSION]),
  idempotency_key: hash,
  revision: positive,
  estado: enumeration(["CREADO", "ERROR", "PENDIENTE", "INCLUIDO"]),
  tuvo_error: boolean,
  error_actual: nullable(
    object({
      etapa: enumeration([
        "ENTRADA",
        "RECUPERACION",
        "COBERTURA",
        "GENERACION_IA",
        "VALIDACION_JSON",
        "VALIDACION_EDITORIAL",
        "PERSISTENCIA",
      ]),
      codigo: string,
      mensaje: string,
      ocurrido_en: timestamp,
      reintentable: boolean,
    }),
  ),
  intentos: positive,
  creado_en: timestamp,
  actualizado_en: timestamp,
  fuente: object({
    fecha_noticia: string,
    mes_noticia: string,
    url_original: string,
    url_normalizada: string,
    url_resuelta: textOrNull,
    doi: textOrNull,
    titulo_original: textOrNull,
    titulo_es: textOrNull,
    autores: strings,
    revista_o_institucion: textOrNull,
    fecha_publicacion_original: textOrNull,
    tipo_documento: nullable(enumeration(DOCUMENT_TYPES)),
    idioma_original: textOrNull,
  }),
  lectura: nullable(
    object({
      texto_completo_verificado: boolean,
      formato: enumeration(["HTML", "XML", "PDF", "OTRO"]),
      metodo_recuperacion: enumeration([
        "EDITORIAL",
        "REPOSITORIO_ABIERTO",
        "DOCUMENTO_LOCAL_AUTORIZADO",
        "OTRO",
      ]),
      recuperado_en: timestamp,
      sha256_contenido_extraido: hash,
      palabras_extraidas: integer,
      secciones_localizadas: strings,
      alcance_y_observaciones: string,
    }),
  ),
  analisis: nullable(ANALYSIS_SCHEMA),
  generacion: object({
    proveedor: textOrNull,
    modelo: textOrNull,
    prompt_version: string,
    generado_en: nullable(timestamp),
    solicitudes_ia: integer,
    tokens_entrada: nullable(integer),
    tokens_salida: nullable(integer),
  }),
  validacion: object({
    estructura_json_ok: boolean,
    identidad_ok: boolean,
    texto_completo_ok: boolean,
    trazabilidad_de_hallazgos_ok: boolean,
    coherencia_editorial_ok: boolean,
    apta_para_sintesis: boolean,
    validada_en: nullable(timestamp),
    observaciones: strings,
  }),
  inclusion_mensual: nullable(
    object({
      mes: string,
      resumen_id: string,
      resumen_revision: positive,
      ficha_revision_incluida: positive,
      incluida_en: timestamp,
    }),
  ),
});

// Validates precisely the JSON Schema subset used above, including extra keys.
export function matchesSchema(value, schema) {
  if (schema.anyOf)
    return schema.anyOf.some((candidate) => matchesSchema(value, candidate));
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "null") return value === null;
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "string")
    return (
      typeof value === "string" &&
      value.trim().length >= (schema.minLength ?? 0) &&
      (!schema.pattern || new RegExp(schema.pattern).test(value))
    );
  if (schema.type === "integer")
    return Number.isSafeInteger(value) && value >= schema.minimum;
  if (schema.type === "array")
    return (
      Array.isArray(value) &&
      value.length >= schema.minItems &&
      (schema.maxItems === undefined || value.length <= schema.maxItems) &&
      value.every((item) => matchesSchema(item, schema.items))
    );
  if (schema.type === "object") {
    return (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === schema.required.length &&
      schema.required.every(
        (key) =>
          Object.hasOwn(value, key) &&
          matchesSchema(value[key], schema.properties[key]),
      )
    );
  }
  return false;
}

function requireValid(condition, message) {
  if (!condition) fail("VALIDACION_JSON", "FICHA_INCONSISTENTE", message);
}

function validateAnalysis(analysis, locators) {
  const words = wordCount(analysis.sintesis_divulgativa);
  requireValid(
    words >= 200 && words <= 350,
    "La síntesis debe contener entre 200 y 350 palabras.",
  );
  requireValid(
    new Set(analysis.hallazgos.map((finding) => finding.hallazgo_id)).size ===
      analysis.hallazgos.length,
    "Los identificadores de hallazgos deben ser únicos.",
  );
  requireValid(
    analysis.hallazgos.every((finding) =>
      locators.includes(finding.ubicacion_en_fuente.seccion),
    ),
    "Un hallazgo cita una sección no localizada en el documento.",
  );
}

export function validateModelResult(result, document) {
  requireValid(
    matchesSchema(result, MODEL_SCHEMA),
    "La respuesta de IA no respeta los campos y tipos del contenido analítico.",
  );
  validateAnalysis(
    result.analisis,
    document.sections.map((section) => section.locator),
  );
  requireValid(
    document.metadata.titulo_original !== null || result.titulo_es === null,
    "No se admite traducir un título que no se pudo recuperar.",
  );
  for (const finding of result.analisis.hallazgos) {
    const location = finding.ubicacion_en_fuente;
    const section = document.sections.find(
      (entry) => entry.locator === location.seccion,
    );
    requireValid(
      location.subseccion === null,
      "Las subsecciones ya tienen localizador propio: no se admiten localizadores inventados.",
    );
    requireValid(
      location.tabla_o_figura === null ||
        section.tables.includes(location.tabla_o_figura),
      "La tabla o figura citada no se extrajo en esa sección.",
    );
    requireValid(
      location.pagina === null || section.pages.includes(location.pagina),
      "La página citada no pertenece a esa sección extraída.",
    );
  }
  return result;
}

export function validateFicha(ficha, identity) {
  requireValid(
    matchesSchema(ficha, FICHA_SCHEMA),
    "La ficha no respeta la estructura JSON normativa.",
  );
  const actual = createIdentity(
    ficha.fuente.fecha_noticia,
    ficha.fuente.url_original,
  );
  requireValid(
    actual.key === ficha.idempotency_key &&
      actual.url === ficha.fuente.url_normalizada &&
      actual.month === ficha.fuente.mes_noticia,
    "La identidad almacenada no coincide con fecha y URL.",
  );
  if (identity)
    requireValid(
      identity.key === actual.key,
      "El archivo existente pertenece a otra identidad.",
    );
  requireValid(
    ficha.revision <= ficha.intentos,
    "La revisión no puede superar la cantidad de intentos.",
  );
  const dates = [
    ficha.creado_en,
    ficha.actualizado_en,
    ficha.error_actual?.ocurrido_en,
    ficha.lectura?.recuperado_en,
    ficha.generacion.generado_en,
    ficha.validacion.validada_en,
    ficha.inclusion_mensual?.incluida_en,
  ].filter(Boolean);
  requireValid(
    dates.every(
      (date) =>
        Number.isFinite(Date.parse(date)) && isCalendarDate(date.slice(0, 10)),
    ),
    "Hay fechas de auditoría inválidas.",
  );
  requireValid(
    Date.parse(ficha.actualizado_en) >= Date.parse(ficha.creado_en),
    "Las fechas de auditoría son inconsistentes.",
  );
  requireValid(
    ficha.fuente.url_resuelta === null || isHttpUrl(ficha.fuente.url_resuelta),
    "La URL resuelta es inválida.",
  );
  requireValid(
    ficha.fuente.fecha_publicacion_original === null ||
      isCalendarDate(ficha.fuente.fecha_publicacion_original),
    "La fecha original es inválida.",
  );
  requireValid(
    ficha.fuente.doi === null || /^10\.\d{4,9}\/\S+$/i.test(ficha.fuente.doi),
    "El DOI no tiene el formato esperado.",
  );
  requireValid(
    ficha.validacion.estructura_json_ok && ficha.validacion.identidad_ok,
    "No consta validación técnica de estructura e identidad.",
  );
  requireValid(
    ficha.validacion.texto_completo_ok ===
      (ficha.lectura?.texto_completo_verificado === true),
    "La validación documental es inconsistente.",
  );
  if (ficha.estado === "ERROR") {
    requireValid(
      ficha.error_actual !== null &&
        ficha.tuvo_error &&
        ficha.analisis === null &&
        !ficha.validacion.apta_para_sintesis &&
        ficha.inclusion_mensual === null,
      "El registro ERROR incumple los invariantes de estado.",
    );
  } else {
    requireValid(
      ficha.error_actual === null &&
        ficha.analisis !== null &&
        ficha.lectura?.texto_completo_verificado === true,
      "Una ficha completa necesita análisis, lectura verificada y ausencia de error actual.",
    );
    requireValid(
      ficha.lectura.palabras_extraidas > 0 &&
        ficha.lectura.secciones_localizadas.length > 0 &&
        ficha.generacion.solicitudes_ia > 0 &&
        ficha.generacion.generado_en !== null &&
        ficha.generacion.modelo !== null &&
        ficha.generacion.proveedor !== null &&
        ficha.fuente.tipo_documento !== null,
      "Faltan datos efectivos de lectura o generación.",
    );
    validateAnalysis(ficha.analisis, ficha.lectura.secciones_localizadas);
    if (ficha.estado === "CREADO")
      requireValid(
        !ficha.validacion.apta_para_sintesis,
        "CREADO todavía no está declarado apto para síntesis.",
      );
    else
      requireValid(
        ficha.validacion.apta_para_sintesis &&
          ficha.validacion.trazabilidad_de_hallazgos_ok &&
          ficha.validacion.coherencia_editorial_ok &&
          ficha.validacion.validada_en !== null,
        "Faltan las validaciones editoriales requeridas.",
      );
  }
  if (ficha.estado === "INCLUIDO") {
    requireValid(
      ficha.inclusion_mensual !== null &&
        ficha.inclusion_mensual.mes === actual.month &&
        ficha.inclusion_mensual.ficha_revision_incluida === ficha.revision,
      "La inclusión mensual no corresponde a la revisión vigente.",
    );
  } else
    requireValid(
      ficha.inclusion_mensual === null,
      "Solo INCLUIDO puede tener inclusión mensual vigente.",
    );
  return ficha;
}
