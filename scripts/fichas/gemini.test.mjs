import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { generateAnalysis, splitSections } from "./gemini.mjs";
import { validateModelResult } from "./schema.mjs";
import {
  apiResponse,
  documentFixture,
  modelFixture,
  NOW,
} from "./test-support.mjs";

const modelInfo = (inputTokenLimit = 1000000) =>
  Response.json({
    supportedGenerationMethods: ["generateContent"],
    inputTokenLimit,
    outputTokenLimit: 16384,
  });
const context = () => ({
  env: {
    GEMINI_API_KEY: randomUUID(),
    GEMINI_MODEL: "modelo-artificial-solo-en-mocks",
  },
  generation: {
    solicitudes_ia: 0,
    tokens_entrada: null,
    tokens_salida: null,
    generado_en: null,
  },
  now: () => NOW,
});

test("REST oficial, modelo configurado, clave solo en header, esquema y datos separados", async () => {
  const document = documentFixture();
  const options = context();
  const calls = [];
  const result = await generateAnalysis(document, {
    ...options,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      if (init.method === "GET") return modelInfo();
      const body = JSON.parse(init.body);
      assert.equal(body.generationConfig.responseMimeType, "application/json");
      assert.deepEqual(body.generationConfig.responseJsonSchema.type, [
        "object",
        "null",
      ]);
      assert.deepEqual(body.generationConfig.responseJsonSchema.required, [
        "titulo_es",
        "tipo_documento",
        "analisis",
      ]);
      assert.equal(body.tools, undefined);
      assert.match(body.systemInstruction.parts[0].text, /DATO NO CONFIABLE/);
      assert.equal(
        JSON.parse(body.contents[0].parts[0].text).texto_completo,
        document.text,
      );
      assert.ok(!init.body.includes(options.env.GEMINI_API_KEY));
      return apiResponse(modelFixture(document));
    },
  });
  assert.deepEqual(result, modelFixture(document));
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every(
      ({ url, init }) =>
        url.startsWith(
          "https://generativelanguage.googleapis.com/v1beta/models/modelo-artificial-solo-en-mocks",
        ) &&
        !url.includes(options.env.GEMINI_API_KEY) &&
        init.redirect === "error" &&
        init.headers["x-goog-api-key"] === options.env.GEMINI_API_KEY,
    ),
  );
  assert.equal(options.generation.solicitudes_ia, 1);
  assert.equal(options.generation.tokens_entrada, 11);
  assert.equal(options.generation.tokens_salida, 7);
  assert.equal(options.generation.generado_en, NOW);
});

test("rechaza bloqueo, truncamiento, código Markdown, esquema extra y ausencia de modelo", async () => {
  const responses = [
    () => apiResponse(null),
    () =>
      apiResponse(null, {
        promptFeedback: { blockReason: "SAFETY" },
        candidates: [],
      }),
    () =>
      apiResponse(null, {
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: JSON.stringify(modelFixture()) }] },
          },
        ],
      }),
    () =>
      apiResponse(null, {
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "```json\n{}\n```" }] },
          },
        ],
      }),
    () => apiResponse({ ...modelFixture(), estado: "PENDIENTE" }),
    () => new Response("sensitive external body", { status: 429 }),
  ];
  for (const response of responses) {
    const options = context();
    await assert.rejects(
      generateAnalysis(documentFixture(), {
        ...options,
        fetchImpl: async (_, init) =>
          init.method === "GET" ? modelInfo() : response(),
      }),
    );
    assert.equal(options.generation.solicitudes_ia, 1);
    assert.equal(options.generation.generado_en, null);
  }
  let calls = 0;
  await assert.rejects(
    generateAnalysis(documentFixture(), {
      env: {},
      fetchImpl: async () => {
        calls += 1;
      },
    }),
    { code: "CONFIGURACION_FALTANTE" },
  );
  assert.equal(calls, 0);
});

test("rechaza secciones, tablas, páginas y títulos sin procedencia", () => {
  const document = documentFixture();
  for (const [field, value] of [
    ["seccion", "SECCION INVENTADA"],
    ["subseccion", "Subsección inventada"],
    ["tabla_o_figura", "Tabla inventada"],
    ["pagina", 99],
  ]) {
    const result = modelFixture(document);
    result.analisis.hallazgos[0].ubicacion_en_fuente[field] = value;
    assert.throws(() => validateModelResult(result, document));
  }
  const withoutTitle = {
    ...document,
    metadata: { ...document.metadata, titulo_original: null },
  };
  assert.throws(() =>
    validateModelResult(modelFixture(document), withoutTitle),
  );
  for (const mutate of [
    (value) => {
      value.analisis.metodologia.tamano_muestra = 3;
    },
    (value) => {
      delete value.analisis.limitaciones;
    },
    (value) => {
      value.analisis.sintesis_divulgativa = "Demasiado breve";
    },
    (value) => {
      value.analisis.puntos_clave_para_sintesis_mensual = ["Solo uno"];
    },
    (value) => {
      value.analisis.hallazgos.push(
        structuredClone(value.analisis.hallazgos[0]),
      );
    },
  ]) {
    const result = modelFixture(document);
    mutate(result);
    assert.throws(() => validateModelResult(result, document));
  }
});

test("fragmentación conserva el texto exacto, secciones y finaliza con integración", async () => {
  const document = documentFixture();
  document.sections = document.sections.map((section) => ({
    ...section,
    text: section.text.repeat(4),
  }));
  document.text = document.sections
    .map((section) => `${section.locator}\n${section.text}`)
    .join("\n\n");
  const chunks = splitSections(document.sections, 3000);
  for (const section of document.sections)
    assert.equal(
      chunks
        .flat()
        .filter((part) => part.seccion === section.locator)
        .map((part) => part.texto)
        .join(""),
      section.text,
    );
  const options = context();
  const readSections = new Set();
  let integrated = false;
  let parts = 0;
  await generateAnalysis(document, {
    ...options,
    fetchImpl: async (_, init) => {
      if (init.method === "GET") return modelInfo(45000);
      const input = JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);
      if (input.fragmentos) {
        parts += 1;
        const sections = [
          ...new Set(input.fragmentos.map((part) => part.seccion)),
        ];
        sections.forEach((section) => readSections.add(section));
        return apiResponse({
          notas: sections.map((seccion) => ({
            seccion,
            notas: "Notas artificiales de prueba; ninguna evidencia real.",
          })),
        });
      }
      assert.ok(input.notas.length > 1);
      assert.equal(
        readSections.size,
        document.sections.filter((section) => section.text).length,
      );
      integrated = true;
      return apiResponse(modelFixture(document));
    },
  });
  assert.ok(integrated && parts > 1);
  assert.equal(options.generation.solicitudes_ia, parts + 1);
  assert.equal(options.generation.tokens_entrada, (parts + 1) * 11);
});

test("notas de fragmentos incompletas se rechazan antes de crear análisis", async () => {
  const document = documentFixture();
  document.text = document.text.repeat(10);
  await assert.rejects(
    generateAnalysis(document, {
      ...context(),
      fetchImpl: async (_, init) =>
        init.method === "GET"
          ? modelInfo(40000)
          : apiResponse({
              notas: [{ seccion: "inventada", notas: "sin procedencia" }],
            }),
    }),
    { code: "FRAGMENTO_INCONSISTENTE" },
  );
});

test("no persiste credenciales reflejadas por el proveedor ni en mensajes de error", async () => {
  const options = context();
  const result = modelFixture();
  result.analisis.tema_principal = options.env.GEMINI_API_KEY;
  await assert.rejects(
    generateAnalysis(documentFixture(), {
      ...options,
      fetchImpl: async (_, init) =>
        init.method === "GET" ? modelInfo() : apiResponse(result),
    }),
    (error) =>
      error.code === "DATO_SENSIBLE" &&
      !error.message.includes(options.env.GEMINI_API_KEY),
  );
  await assert.rejects(
    generateAnalysis(documentFixture(), {
      ...context(),
      fetchImpl: async () => {
        throw new Error(options.env.GEMINI_API_KEY);
      },
    }),
    (error) => !error.message.includes(options.env.GEMINI_API_KEY),
  );
});
