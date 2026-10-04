import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import test from "node:test";
import { createIdentity, FichaError, ROOT, wordCount } from "./core.mjs";
import { generateFicha, main as generateMain } from "./generar-ficha.mjs";
import { main as processMain, processFicha } from "./procesar-ficha.mjs";
import { retrieveDocument } from "./retrieval.mjs";
import { outputPath, writeCoverageText } from "./storage.mjs";
import { DATE, htmlDocument, mockGenerate, paragraph, URL } from "./test-support.mjs";

const TIMESTAMP = "2026-11-01T00:00:00.123Z";
const input = { date: DATE, url: URL };
const bodyText = (words = 300) => Array(words).fill("artificial").join(" ");
const markup = (body = bodyText()) => htmlDocument([
  ["Abstract", paragraph("EXCLUIDO_RESUMEN")],
  ["Results", body],
  ["References", paragraph("EXCLUIDO_REFERENCIAS")],
  ["Author information", paragraph("EXCLUIDO_AUXILIAR")],
]);
const retrieve = (html) => retrieveDocument(URL, {
  now: () => TIMESTAMP,
  fetchImpl: async () => new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  }),
});

test.beforeEach((t) => {
  t.mock.method(globalThis, "fetch", () => {
    assert.fail("Estas pruebas no deben llamar a servicios externos.");
  });
});

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), "ficha-coverage-text-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const env = {
    FICHAS_DIR: directory,
    GEMINI_API_KEY: "credencial-artificial-solo-para-tests",
    GEMINI_MODEL: "modelo-artificial",
  };
  const dependencies = {
    env, now: () => TIMESTAMP,
    retrieve: () => retrieve(markup()),
    generate: mockGenerate,
  };
  return { directory, env, dependencies };
}

test("TXT exacto, privado, con milisegundos UTC y junto al JSON antes de consumir IA", async (t) => {
  const { directory, env, dependencies } = await setup(t);
  // Relative FICHAS_DIR follows the same repository-root convention as JSON.
  env.FICHAS_DIR = relative(ROOT, directory);
  const expectedPath = join(directory, DATE.slice(0, 7), "2026-11-01-00-00-00-123.txt");
  const result = await generateFicha(input, {
    ...dependencies,
    generate: async (...args) => {
      assert.equal(await readFile(expectedPath, "utf8"), bodyText());
      return mockGenerate(...args);
    },
  });
  assert.equal(result.record.estado, "CREADO");
  assert.equal(result.record.validacion.apta_para_sintesis, false);
  assert.equal(result.coverageTextPath, expectedPath);
  assert.equal(dirname(result.coverageTextPath), dirname(result.path));
  const text = await readFile(result.coverageTextPath, "utf8");
  assert.equal(text, bodyText());
  assert.equal(wordCount(text), 300);
  assert.ok(!text.includes("EXCLUIDO"));
  assert.ok(!text.includes("Results"));
  assert.ok(!("coverageTextPath" in result.record));
  assert.equal((await stat(result.coverageTextPath)).mode & 0o777, 0o600);
  assert.equal(result.record.generacion.solicitudes_ia, 1);
});

test("cobertura fallida exporta las 299 palabras; reintento conserva ambos TXT y reutilizar no crea otro", async (t) => {
  const { dependencies, env } = await setup(t);
  let recovered = false;
  let generated = 0;
  const options = {
    env,
    runGenerator: (parameters) => generateFicha(parameters, {
      ...dependencies,
      retrieve: () => retrieve(markup(bodyText(recovered ? 300 : 299))),
      generate: (...args) => {
        generated += 1;
        return mockGenerate(...args);
      },
    }),
  };
  const failed = await processFicha(input, options);
  assert.equal(failed.record.estado, "ERROR");
  assert.equal(failed.record.error_actual.codigo, "COBERTURA_INSUFICIENTE");
  assert.equal(await readFile(failed.coverageTextPath, "utf8"), bodyText(299));
  assert.equal(generated, 0);
  recovered = true;
  const success = await processFicha(input, options);
  assert.equal(success.record.estado, "CREADO");
  assert.equal(success.record.tuvo_error, true);
  assert.equal(success.record.intentos, 2);
  assert.equal(success.retried, true);
  assert.notEqual(success.coverageTextPath, failed.coverageTextPath);
  assert.equal(await readFile(success.coverageTextPath, "utf8"), bodyText());
  assert.equal(await readFile(failed.coverageTextPath, "utf8"), bodyText(299));
  const before = await readdir(dirname(success.path));
  assert.equal(before.filter((name) => name.endsWith(".txt")).length, 2);
  assert.equal((await processFicha(input, options)).status, "skipped");
  assert.equal((await generateFicha(input, dependencies)).status, "skipped");
  assert.deepEqual(await readdir(dirname(success.path)), before);
  assert.equal(generated, 1);
});

test("sin cuerpo evaluable, bloqueos, cancelación y HTML truncado dejan un TXT vacío", async (t) => {
  for (const [label, retrieveDocument] of [
    ["abstract", () => retrieve(htmlDocument([["Abstract", paragraph("Resumen", 30)]]))],
    ["truncado", () => retrieve(markup().replace("</article>", ""))],
    ["bloqueo", () => retrieve("<title>Purchase this article</title>")],
    ["cancelación", async () => {
      throw new FichaError("RECUPERACION", "TEXTO_COMPLETO_NO_DISPONIBLE", "Se canceló la verificación humana.");
    }],
  ]) await t.test(label, async (t) => {
    const { dependencies } = await setup(t);
    const result = await generateFicha(input, {
      ...dependencies,
      retrieve: retrieveDocument,
      generate: () => assert.fail("No debe generar sin cuerpo evaluable."),
    });
    assert.equal(result.record.estado, "ERROR");
    assert.equal(await readFile(result.coverageTextPath, "utf8"), "");
    assert.equal(result.record.generacion.solicitudes_ia, 0);
    assert.equal(result.record.validacion.apta_para_sintesis, false);
  });
});

test("fallos posteriores de configuración, IA, validación JSON y persistencia conservan el TXT", async (t) => {
  for (const stage of ["configuración", "IA", "JSON", "persistencia"])
    await t.test(stage, async (t) => {
      const { dependencies, env } = await setup(t);
      if (stage === "configuración") dependencies.env = { FICHAS_DIR: env.FICHAS_DIR };
      if (stage === "IA") dependencies.generate = async () => { throw new Error("Fallo artificial"); };
      if (stage === "JSON") dependencies.generate = async () => ({ incompleto: true });
      if (stage === "persistencia") dependencies.write = async () => { throw new Error("Fallo artificial de disco"); };
      if (stage === "persistencia") {
        const logs = [];
        assert.equal(await generateMain(["--fecha", DATE, "--url", URL], {
          ...dependencies,
          stdout: () => assert.fail("No puede informar éxito de persistencia."),
          stderr: (line) => logs.push(line),
        }), 1);
        const path = join(env.FICHAS_DIR, DATE.slice(0, 7), "2026-11-01-00-00-00-123.txt");
        assert.equal(await readFile(path, "utf8"), bodyText());
        assert.ok(logs.some((line) => line.includes(path)));
        assert.deepEqual(await readdir(dirname(path)), [basename(path)]);
      } else {
        const result = await generateFicha(input, dependencies);
        assert.equal(result.record.estado, "ERROR");
        assert.equal(await readFile(result.coverageTextPath, "utf8"), bodyText());
      }
    });
});

test("force conserva TXT anteriores incluso cuando el diagnóstico JSON va a historial", async (t) => {
  const { dependencies } = await setup(t);
  const first = await generateFicha(input, dependencies);
  const result = await generateFicha({ ...input, force: true }, {
    ...dependencies,
    generate: async () => { throw new Error("Fallo artificial"); },
  });
  assert.equal(result.record.estado, "ERROR");
  assert.match(result.path, /historial/);
  assert.equal(dirname(result.coverageTextPath), dirname(first.path));
  assert.notEqual(result.coverageTextPath, first.coverageTextPath);
  assert.equal(await readFile(result.coverageTextPath, "utf8"), bodyText());
  assert.equal(await readFile(first.coverageTextPath, "utf8"), bodyText());
  assert.equal(JSON.parse(await readFile(first.path, "utf8")).estado, "CREADO");
});

test("colisiones concurrentes no sobrescriben TXT y conservan el formato incluso al cambiar de día", async (t) => {
  const { env } = await setup(t);
  const fichaPath = await outputPath(createIdentity(DATE, URL), env.FICHAS_DIR);
  const previous = join(dirname(fichaPath), "2026-10-31-23-59-59-999.txt");
  await writeFile(previous, "Texto anterior", { mode: 0o600 });
  const texts = ["Texto primero", "Texto segundo", "Texto tercero"];
  const paths = await Promise.all(texts.map((text) => writeCoverageText(fichaPath, text, {
    timestamp: "2026-10-31T23:59:59.999Z",
  })));
  assert.equal(new Set(paths).size, 3);
  for (const [index, path] of paths.entries()) {
    assert.match(basename(path), /^2026-11-01-00-00-00-00[0-2]\.txt$/);
    assert.equal(await readFile(path, "utf8"), texts[index]);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  }
  assert.equal(await readFile(previous, "utf8"), "Texto anterior");
  assert.equal((await readdir(dirname(fichaPath))).length, 4);
});

test("fallo de escritura del TXT produce diagnóstico claro, limpia el temporal y evita IA", async (t) => {
  const { dependencies, env } = await setup(t);
  const result = await generateFicha(input, {
    ...dependencies,
    writeText: (path, text, options) => writeCoverageText(path, text, {
      ...options,
      linkFile: async (temporary) => {
        assert.equal(await readFile(temporary, "utf8"), bodyText());
        throw new Error(env.GEMINI_API_KEY);
      },
    }),
    generate: () => assert.fail("No debe consumir IA si falla el TXT."),
  });
  assert.equal(result.record.estado, "ERROR");
  assert.equal(result.record.error_actual.codigo, "TXT_COBERTURA_NO_PERSISTIDO");
  assert.equal(result.record.error_actual.etapa, "PERSISTENCIA");
  assert.equal(result.coverageTextPath, null);
  assert.deepEqual(await readdir(dirname(result.path)), [basename(result.path)]);
  assert.ok(!JSON.stringify(result).includes(env.GEMINI_API_KEY));
});

test("credenciales en contenido recuperado no se filtran hacia el TXT", async (t) => {
  const { dependencies, env } = await setup(t);
  const result = await generateFicha(input, {
    ...dependencies,
    retrieve: () => retrieve(markup(`${bodyText()} ${env.GEMINI_API_KEY}`)),
    generate: () => assert.fail("No generar con contenido sensible."),
  });
  assert.equal(result.record.error_actual.codigo, "DATO_SENSIBLE");
  assert.equal(await readFile(result.coverageTextPath, "utf8"), "");
  assert.ok(!JSON.stringify(result).includes(env.GEMINI_API_KEY));
  await assert.rejects(writeCoverageText(result.path, env.GEMINI_API_KEY, {
    timestamp: TIMESTAMP, secret: env.GEMINI_API_KEY,
  }), { code: "DATO_SENSIBLE" });
});

test("ambas CLI muestran el TXT en éxito y en fallo de cobertura", async (t) => {
  for (const cli of [generateMain, processMain])
    for (const enough of [true, false]) {
      const { dependencies, env } = await setup(t);
      dependencies.retrieve = () => retrieve(markup(bodyText(enough ? 300 : 299)));
      const logs = [];
      const code = await cli(["--fecha", DATE, "--url", URL], {
        ...dependencies, env,
        runGenerator: (parameters) => generateFicha(parameters, dependencies),
        stdout: (line) => logs.push(line), stderr: (line) => logs.push(line),
      });
      assert.equal(code, enough ? 0 : 1);
      const path = join(env.FICHAS_DIR, DATE.slice(0, 7), "2026-11-01-00-00-00-123.txt");
      assert.ok(logs.some((line) => line.includes(`TXT del cuerpo evaluado: ${path}`)));
      assert.equal(await readFile(path, "utf8"), bodyText(enough ? 300 : 299));
    }
});
