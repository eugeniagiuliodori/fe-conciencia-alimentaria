import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { main as generateMain, generateFicha } from "./generar-ficha.mjs";
import { main as processMain } from "./procesar-ficha.mjs";
import { retrieveDocument } from "./retrieval.mjs";
import {
  DATE, htmlDocument, mockGenerate, NOW, paragraph, SECTION_DATA, URL,
} from "./test-support.mjs";

// Synthetic layouts only: no publisher downloads or scientific claims.
const page = (content) => htmlDocument([]).replace("</article>", `${content}</article>`);
const sections = (data = SECTION_DATA, level = 3) => data.map(
  ([heading, text]) => `<section><h${level}>${heading}</h${level}><p>${text}</p></section>`,
).join("");
const retrieve = (markup) => retrieveDocument(URL, {
  fetchImpl: async () => new Response(markup, {
    headers: { "content-type": "text/html" },
  }),
  now: () => NOW,
});
const flatLayout = () => page(
  `<h2>Abstract</h2><p>${paragraph("Resumen artificial")}</p>${sections()}`,
).replaceAll("<section>", "").replaceAll("</section>", "")
  .replaceAll("<h3>", "<h2>").replaceAll("</h3>", "</h2>");

test.beforeEach((t) => {
  t.mock.method(globalThis, "fetch", () => {
    assert.fail("Estas pruebas no deben acceder a servicios externos.");
  });
});

test("contenedores de abstract prevalecen sobre encabezados internos y terminan en su cierre", async () => {
  for (const attributes of [
    'id="Abs1"', 'class="abstract-content"', 'role="doc-abstract"',
    'itemprop="abstract"', 'aria-labelledby="summary-heading"',
  ]) {
    const abstract = `<section ${attributes}><h2 id="summary-heading">Abstract</h2>
      <h2>Methods</h2><p>${paragraph("MARCA_RESUMEN")}</p></section>`;
    const body = (data) => `<div itemprop="articleBody">${sections(data, 4)}</div>`;
    const document = await retrieve(page(abstract + body(SECTION_DATA)));
    assert.equal(document.reading.texto_completo_verificado, true);
    const summary = document.sections.filter((section) => section.text.includes("MARCA_RESUMEN"));
    assert.ok(summary.length > 0);
    assert.ok(summary.every((section) => section.roles.includes("ABSTRACT")), attributes);
    await assert.rejects(
      retrieve(page(abstract + body([["Cuerpo", Array(299).fill("artificial").join(" ")]]))),
      { code: "COBERTURA_INSUFICIENTE" },
    );
  }
});

test("sección de abstract sin atributos no absorbe el cuerpo siguiente con encabezados menores", async () => {
  const abstract = `<section><header><h2>Resumen</h2></header>
    <h3>Métodos</h3><p>${paragraph("MARCA_ABSTRACT")}</p></section>`;
  const document = await retrieve(page(abstract + sections(SECTION_DATA, 4)));
  assert.equal(document.reading.texto_completo_verificado, true);
  assert.ok(document.sections.find((section) => section.text.includes("MARCA_ABSTRACT"))
    .roles.includes("ABSTRACT"));
  assert.ok(document.sections.find((section) => section.heading === "Methods")
    .roles.includes("METODOS"));
});

test("niveles internos incorrectos en una sección Abstract se aceptan con aviso sin contar su texto", async () => {
  const abstract = `<section><h2>Abstract</h2><h2>Methods</h2><p>${paragraph("RESUMEN")}</p></section>`;
  const document = await retrieve(page(abstract + sections()));
  assert.equal(document.reading.texto_completo_verificado, true);
  assert.match(document.reading.alcance_y_observaciones, /Evaluación del diseño ambigua/);
  await assert.rejects(
    retrieve(page(abstract + sections([["Cuerpo", Array(299).fill("artificial").join(" ")]]))),
    { code: "COBERTURA_INSUFICIENTE" },
  );
});

test("un contenedor que solo envuelve el título Abstract no termina el resumen", async () => {
  const abstract = `<div class="abstract-heading"><h2>Abstract</h2></div>
    <h3>Methods</h3><p>${paragraph("RESUMEN_EN_CUERPO_PLANO")}</p>`;
  const body = (data) => sections(data, 2);
  await assert.rejects(
    retrieve(page(abstract + body([["Cuerpo", Array(299).fill("artificial").join(" ")]]))),
    { code: "COBERTURA_INSUFICIENTE" },
  );
  const document = await retrieve(page(abstract + body(SECTION_DATA)));
  assert.equal(document.reading.texto_completo_verificado, true);
  assert.match(document.reading.alcance_y_observaciones, /Evaluación del diseño ambigua/);
  assert.ok(document.sections.find((section) => section.text.includes("RESUMEN_EN_CUERPO_PLANO"))
    .roles.includes("ABSTRACT"));
});

test("el título bibliográfico identifica el artículo entre tarjetas de mayor longitud", async () => {
  const related = `<article><h1>Otra tarjeta artificial</h1><p>${paragraph("RELACIONADO", 200)}</p></article>`;
  const document = await retrieve(page(sections()).replace("</body>", `${related}</body>`));
  assert.equal(document.reading.texto_completo_verificado, true);
  assert.ok(!document.text.includes("RELACIONADO"));
  assert.deepEqual(document.warnings, []);
});

test("encabezados ARIA y contenedor articleBody delimitan cuerpo tras un abstract plano", async () => {
  const body = sections().replaceAll("<h3>", '<div role="heading" aria-level="3">')
    .replaceAll("</h3>", "</div>");
  const document = await retrieve(page(
    `<h2>Abstract</h2><p>${paragraph("Resumen")}</p><div itemprop="articleBody">${body}</div>`,
  ));
  assert.equal(document.reading.texto_completo_verificado, true);
  assert.match(document.reading.alcance_y_observaciones, /Evaluación del diseño ambigua/);
});

test("metadatos y artículos relacionados no completan el mínimo de cuerpo", async () => {
  const auxiliary = `<section class="author-information"><h2>Author information</h2>
    <h3>Methods</h3><p>${paragraph("METADATOS", 40)}</p></section>
    <section><h2>Similar content being viewed by others</h2>
    <h3>Methods</h3><p>${paragraph("RELACIONADOS", 40)}</p></section>`;
  const brief = [
    ["Introduction", 40], ["Methods", 60], ["Results", 60],
    ["Discussion", 60], ["Limitations", 25], ["References", 100],
  ].map(([heading, count]) => [heading, Array(count).fill("artificial").join(" ")]);
  await assert.rejects(retrieve(page(sections(brief) + auxiliary)), /demasiado breve/);
  const document = await retrieve(page(
    sections(SECTION_DATA.filter(([heading]) => heading !== "Methods")) + auxiliary,
  ));
  assert.equal(document.reading.texto_completo_verificado, true);
  assert.ok(document.text.includes("METADATOS"));
  assert.ok(document.sections.filter((section) => section.text.includes("METADATOS"))
    .every((section) => section.scope === "auxiliary"));
  assert.ok(document.sections.filter((section) => section.text.includes("RELACIONADOS"))
    .every((section) => section.scope === "auxiliary"));
});

test("los cierres de contenedores preservan texto posterior, orden y tablas del cuerpo", async () => {
  const table = '<table><caption>Table 1 artificial</caption><tr><td>Marca tabla</td></tr></table>';
  const document = await retrieve(page(
    `<p>MARCA_ANTES</p><div class="abstract"><p>MARCA_DENTRO</p></div>
    <p>MARCA_DESPUES</p>${sections().replace("<h3>Results</h3>", `<h3>Results</h3>${table}`)}`,
  ));
  assert.ok(document.text.indexOf("MARCA_ANTES") < document.text.indexOf("MARCA_DENTRO"));
  assert.ok(document.text.indexOf("MARCA_DENTRO") < document.text.indexOf("MARCA_DESPUES"));
  assert.ok(!document.sections.find((section) => section.text.includes("MARCA_DESPUES"))
    .roles.includes("ABSTRACT"));
  assert.ok(document.sections.find((section) => section.roles.includes("RESULTADOS"))
    .tables.includes("Table 1 artificial"));
});

test("diseño plano se acepta con aviso, pero un abstract ambiguo no acredita el cuerpo", async () => {
  const document = await retrieve(flatLayout());
  assert.equal(document.reading.texto_completo_verificado, true);
  assert.ok(document.warnings.some((warning) => warning.startsWith("Evaluación del diseño ambigua:")));
  assert.match(document.reading.alcance_y_observaciones, /Evaluación del diseño ambigua/);
  const onlySummary = page(`<h2>Abstract</h2>${sections()}`);
  await assert.rejects(retrieve(onlySummary), (error) => {
    assert.equal(error.code, "COBERTURA_INSUFICIENTE");
    assert.equal(error.document.reading.texto_completo_verificado, false);
    assert.match(error.document.reading.alcance_y_observaciones, /Evaluación del diseño ambigua/);
    return true;
  });
});

test("marcas contradictorias no hacen pasar un abstract por cuerpo y no se reparan cierres", async () => {
  const contradictory = page(`<div class="abstract" itemprop="articleBody">${sections()}</div>`);
  await assert.rejects(retrieve(contradictory), { code: "COBERTURA_INSUFICIENTE" });
  await assert.rejects(retrieve(page(`<section role="doc-abstract"><h2>Abstract</h2>${sections()}`)),
    { code: "COBERTURA_INSUFICIENTE" });
});

test("aviso persiste en CREADO, ambas CLI lo muestran y reutilizar no cambia la ficha", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ficha-layout-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const env = { FICHAS_DIR: directory, GEMINI_API_KEY: "secreto-artificial", GEMINI_MODEL: "modelo-artificial" };
  const logs = [];
  const dependencies = {
    env, now: () => NOW, retrieve: () => retrieve(flatLayout()), generate: mockGenerate,
  };
  const args = ["--fecha", DATE, "--url", URL];
  const runGenerator = (parameters) => generateFicha(parameters, dependencies);
  assert.equal(await processMain(args, {
    env, runGenerator, stdout: (text) => logs.push(text), stderr: (text) => logs.push(text),
  }), 0);
  assert.match(logs.join("\n"), /Evaluación del diseño ambigua/);
  const result = await runGenerator({ date: DATE, url: URL });
  const saved = await readFile(result.path, "utf8");
  assert.equal(result.record.estado, "CREADO");
  assert.equal(result.record.validacion.apta_para_sintesis, false);
  assert.equal(result.record.validacion.coherencia_editorial_ok, false);
  assert.ok(result.record.validacion.observaciones.some((note) => /Evaluación del diseño ambigua/.test(note)));
  assert.equal(result.record.generacion.solicitudes_ia, 1);
  logs.length = 0;
  assert.equal(await generateMain(args, {
    ...dependencies, stdout: (text) => logs.push(text), stderr: (text) => logs.push(text),
  }), 0);
  assert.match(logs.join("\n"), /Evaluación del diseño ambigua/);
  assert.equal(await readFile(result.path, "utf8"), saved);
  logs.length = 0;
  assert.equal(await processMain(args, {
    env: { FICHAS_DIR: directory },
    runGenerator: () => assert.fail("Reutilizar no debe generar ni pedir credenciales."),
    stdout: (text) => logs.push(text), stderr: (text) => logs.push(text),
  }), 0);
  assert.match(logs.join("\n"), /Evaluación del diseño ambigua/);
  assert.equal(await readFile(result.path, "utf8"), saved);
  assert.ok(!saved.includes(env.GEMINI_API_KEY));
});

test("aviso persiste y se muestra también al fallar cobertura o generación", async (t) => {
  for (const stage of ["COBERTURA", "GENERACION_IA"]) {
    const directory = await mkdtemp(join(tmpdir(), "ficha-layout-error-test-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const env = { FICHAS_DIR: directory, GEMINI_API_KEY: "secreto-artificial", GEMINI_MODEL: "modelo-artificial" };
    let generated = 0;
    const dependencies = {
      env, now: () => NOW,
      retrieve: () => retrieve(stage === "COBERTURA"
        ? page(`<h2>Abstract</h2>${sections()}`) : flatLayout()),
      generate: async () => {
        generated += 1;
        throw new Error("Fallo artificial de generación");
      },
    };
    const result = await generateFicha({ date: DATE, url: URL }, dependencies);
    assert.equal(result.record.estado, "ERROR");
    assert.equal(result.record.error_actual.etapa, stage);
    assert.equal(result.record.lectura.texto_completo_verificado, stage !== "COBERTURA");
    assert.equal(result.record.validacion.apta_para_sintesis, false);
    assert.ok(result.record.validacion.observaciones.some((note) => /Evaluación del diseño ambigua/.test(note)));
    const args = ["--fecha", DATE, "--url", URL];
    const logs = [];
    const output = { stdout: (text) => logs.push(text), stderr: (text) => logs.push(text) };
    assert.equal(await generateMain(args, { ...dependencies, ...output }), 1);
    assert.match(logs.join("\n"), /Evaluación del diseño ambigua/);
    logs.length = 0;
    assert.equal(await processMain(args, {
      env, ...output,
      runGenerator: (parameters) => generateFicha(parameters, dependencies),
    }), 1);
    assert.match(logs.join("\n"), /Evaluación del diseño ambigua/);
    assert.equal(generated, stage === "COBERTURA" ? 0 : 3);
  }
});
