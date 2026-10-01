// Artificial fixtures for software tests only. No real publication or scientific claims.
import { extractMarkup, verifyDocument } from "./retrieval.mjs";

export const DATE = "2026-10-01";
export const URL = "https://ejemplo.org/articulo";
export const NOW = "2026-10-01T18:00:00.000Z";

export const paragraph = (label, times = 12) =>
  Array.from(
    { length: times },
    (_, index) =>
      `${label} ${index}: Este documento artificial solo sirve para comprobar la extracción y las transiciones del programa. Sus palabras no describen participantes, estudios ni resultados científicos reales.`,
  ).join(" ");
export const SECTION_DATA = [
  ["Introduction", paragraph("Contexto")],
  ["Methods", paragraph("Procedimiento")],
  ["Results", paragraph("Marca alfa")],
  ["Discussion", paragraph("Interpretación")],
  ["Limitations", paragraph("Limitaciones sintéticas", 3)],
  ["References", paragraph("Referencia artificial sin enlaces", 2)],
];

export function htmlDocument(sections = SECTION_DATA) {
  return `<!doctype html><html lang="es"><head><meta name="citation_title" content="Documento artificial para pruebas"><meta name="citation_author" content="Autor sintético"><meta name="citation_publication_date" content="2020/02/02"><title>Documento artificial para pruebas</title></head><body><nav>${paragraph("Navegación")}</nav><article><h1>Documento artificial para pruebas</h1>${sections.map(([heading, text]) => `<section><h2>${heading}</h2><p>${text}</p></section>`).join("")}</article></body></html>`;
}

export function xmlDocument() {
  return `<?xml version="1.0" encoding="UTF-8"?><article xml:lang="es"><front><article-meta><title-group><article-title>Documento artificial para pruebas</article-title></title-group><pub-date><year>2020</year><month>2</month><day>2</day></pub-date></article-meta></front><body>${SECTION_DATA.slice(
    0,
    -1,
  )
    .map(
      ([heading, text]) => `<sec><title>${heading}</title><p>${text}</p></sec>`,
    )
    .join(
      "",
    )}</body><back><ref-list><title>References</title><ref>${SECTION_DATA.at(-1)[1]}</ref></ref-list></back></article>`;
}

export function documentFixture() {
  return verifyDocument(extractMarkup(htmlDocument()), {
    url: URL,
    now: () => NOW,
  });
}

export function modelFixture(document = documentFixture()) {
  const resultSection = document.sections.find((section) =>
    section.roles.includes("RESULTADOS"),
  );
  return {
    titulo_es:
      document.metadata.titulo_original === null
        ? null
        : "Documento artificial para pruebas",
    tipo_documento: "OTRO",
    analisis: {
      tema_principal: "Prueba de software con contenido artificial",
      temas_secundarios: [],
      palabras_clave: ["prueba"],
      pregunta_de_investigacion: null,
      objetivo: "Verificar el programa con material sintético.",
      metodologia: {
        diseno: "Documento sintético, sin investigación real.",
        poblacion_o_material: "Texto artificial.",
        tamano_muestra: null,
        ambito_geografico: null,
        periodo_o_seguimiento: null,
        intervencion_o_exposicion: null,
        comparador: null,
        desenlaces_evaluados: [],
      },
      hallazgos: [
        {
          hallazgo_id: "H01",
          descripcion: "La sección artificial contiene la marca alfa.",
          magnitud_y_unidad: null,
          intervalo_confianza_o_incertidumbre: null,
          ubicacion_en_fuente: {
            seccion: resultSection.locator,
            subseccion: null,
            tabla_o_figura: null,
            pagina: null,
          },
          interpretacion_acotada:
            "Solo evidencia el funcionamiento de una prueba de software.",
        },
      ],
      conclusiones_de_los_autores: null,
      limitaciones: ["Todo el contenido es artificial."],
      lo_que_no_demuestra: [
        "No demuestra ninguna afirmación científica ni sanitaria.",
      ],
      relevancia_para_alimentacion_y_salud:
        "Ninguna; es una prueba del programa.",
      implicaciones_practicas_condicionadas: [],
      sintesis_divulgativa: paragraph("Síntesis ficticia de software", 8),
      puntos_clave_para_sintesis_mensual: [
        "Este material es artificial.",
        "No debe publicarse como contenido científico.",
      ],
      alertas_editoriales: [
        "Maqueta exclusiva para pruebas, sin validez científica.",
      ],
    },
  };
}

export async function mockGenerate(document, { generation, now }) {
  generation.solicitudes_ia += 1;
  generation.generado_en = now();
  return modelFixture(document);
}

export function apiResponse(value, overrides = {}) {
  return Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(value) }] },
      },
    ],
    usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7 },
    ...overrides,
  });
}
