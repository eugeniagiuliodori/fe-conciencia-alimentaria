import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createIdentity, FichaError, ROOT } from "./core.mjs";
import { generateFicha, main } from "./generar-ficha.mjs";
import { retrieveDocument } from "./retrieval.mjs";
import { validateFicha } from "./schema.mjs";
import { acquireLock, atomicWrite, outputPath } from "./storage.mjs";
import {
  DATE,
  documentFixture,
  htmlDocument,
  mockGenerate,
  NOW,
  URL,
} from "./test-support.mjs";

const execFileAsync = promisify(execFile);
const input = { date: DATE, url: URL };

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), "fichas-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const env = {
    FICHAS_DIR: directory,
    GEMINI_API_KEY: randomUUID(),
    GEMINI_MODEL: "modelo-artificial-solo-en-mocks",
  };
  const counters = { retrieval: 0, generation: 0 };
  const dependencies = {
    env,
    now: () => NOW,
    retrieve: async () => {
      counters.retrieval += 1;
      return documentFixture();
    },
    generate: async (...args) => {
      counters.generation += 1;
      return mockGenerate(...args);
    },
  };
  return { directory, env, counters, dependencies };
}

async function contents(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await contents(path)));
    else result.push({ path, text: await readFile(path, "utf8") });
  }
  return result;
}

test("CREADO respeta todas las claves del ejemplo normativo y no se promueve", async (t) => {
  const { dependencies } = await setup(t);
  const result = await generateFicha(input, dependencies);
  assert.equal(result.status, "created");
  assert.equal(result.record.estado, "CREADO");
  assert.equal(result.record.revision, 1);
  assert.equal(result.record.intentos, 1);
  assert.equal(result.record.error_actual, null);
  assert.equal(result.record.tuvo_error, false);
  assert.equal(result.record.validacion.trazabilidad_de_hallazgos_ok, false);
  assert.equal(result.record.validacion.coherencia_editorial_ok, false);
  assert.equal(result.record.validacion.apta_para_sintesis, false);
  assert.equal(result.record.validacion.validada_en, null);
  assert.equal(result.record.fuente.fecha_noticia, DATE);
  assert.equal(result.record.fuente.fecha_publicacion_original, "2020-02-02");
  assert.equal(
    validateFicha(JSON.parse(await readFile(result.path, "utf8"))).estado,
    "CREADO",
  );
  const contract = await readFile(
    join(ROOT, "docs/CONTRATO_EDITORIAL_FICHAS.md"),
    "utf8",
  );
  const template = JSON.parse(contract.match(/```json\s*([\s\S]*?)```/)[1]);
  function compareKeys(actual, reference) {
    if (reference === null || typeof reference !== "object") return;
    if (Array.isArray(reference)) {
      if (reference[0] && actual[0]) compareKeys(actual[0], reference[0]);
      return;
    }
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(reference).sort());
    for (const key of Object.keys(reference))
      compareKeys(actual[key], reference[key]);
  }
  compareKeys(result.record, template);
});

test("una ficha íntegra se omite sin red/IA aun sin credenciales", async (t) => {
  const { dependencies, counters, env } = await setup(t);
  const first = await generateFicha(input, dependencies);
  const before = await readFile(first.path, "utf8");
  const second = await generateFicha(input, {
    ...dependencies,
    env: { FICHAS_DIR: env.FICHAS_DIR },
  });
  assert.equal(second.status, "skipped");
  assert.equal(second.path, first.path);
  assert.deepEqual(counters, { retrieval: 1, generation: 1 });
  assert.equal(await readFile(first.path, "utf8"), before);
});

test("ERROR persistente sin texto completo, reintento y recuperación conservan historial", async (t) => {
  const { dependencies, counters, directory } = await setup(t);
  const broken = {
    ...dependencies,
    retrieve: async () => {
      throw new FichaError(
        "COBERTURA",
        "COBERTURA_INSUFICIENTE",
        "Documento incompleto.",
      );
    },
  };
  const first = await generateFicha(input, broken);
  assert.equal(first.record.estado, "ERROR");
  assert.equal(first.record.analisis, null);
  assert.equal(first.record.lectura, null);
  assert.equal(first.record.tuvo_error, true);
  assert.equal(first.record.error_actual.codigo, "COBERTURA_INSUFICIENTE");
  assert.equal(first.record.generacion.solicitudes_ia, 0);
  assert.equal(first.record.validacion.texto_completo_ok, false);
  const second = await generateFicha(input, broken);
  assert.equal(second.record.intentos, 2);
  assert.equal(second.record.revision, 1);
  const recovered = await generateFicha(input, dependencies);
  assert.equal(recovered.record.estado, "CREADO");
  assert.equal(recovered.record.error_actual, null);
  assert.equal(recovered.record.tuvo_error, true);
  assert.equal(recovered.record.intentos, 3);
  assert.equal(recovered.record.revision, 2);
  assert.equal(counters.generation, 1);
  assert.ok(
    (await contents(directory)).some(
      (file) =>
        file.path.includes("historial") &&
        JSON.parse(file.text).estado === "ERROR",
    ),
  );
});

test("abstract y bloqueo: integración real de recuperador mockeado, cero llamadas de IA", async (t) => {
  const { dependencies, counters } = await setup(t);
  for (const [index, response] of [
    new Response(htmlDocument([["Abstract", "Solo un resumen."]]), {
      headers: { "content-type": "text/html" },
    }),
    new Response("denied", { status: 403 }),
  ].entries()) {
    const result = await generateFicha(
      { ...input, url: `${URL}?prueba=${index}` },
      {
        ...dependencies,
        retrieve: (url) =>
          retrieveDocument(url, { fetchImpl: async () => response }),
      },
    );
    assert.equal(result.record.estado, "ERROR");
    assert.equal(result.record.analisis, null);
    assert.equal(result.record.validacion.apta_para_sintesis, false);
    assert.equal(result.record.generacion.solicitudes_ia, 0);
    if (index === 0) {
      assert.equal(result.record.lectura.texto_completo_verificado, false);
      assert.equal(
        result.record.fuente.titulo_original,
        "Documento artificial para pruebas",
      );
      assert.match(
        result.record.lectura.sha256_contenido_extraido,
        /^[a-f0-9]{64}$/,
      );
    }
  }
  assert.equal(counters.generation, 0);
});

test("force incrementa revisión, conserva creado_en y archiva la revisión previa", async (t) => {
  const { dependencies, directory } = await setup(t);
  const first = await generateFicha(input, dependencies);
  const second = await generateFicha(
    { ...input, force: true },
    { ...dependencies, now: () => "2026-10-02T18:00:00.000Z" },
  );
  assert.equal(second.record.revision, 2);
  assert.equal(second.record.intentos, 2);
  assert.equal(second.record.creado_en, first.record.creado_en);
  assert.equal(second.record.actualizado_en, "2026-10-02T18:00:00.000Z");
  const archived = (await contents(directory)).filter((file) =>
    file.path.includes("historial"),
  );
  assert.equal(archived.length, 1);
  assert.deepEqual(JSON.parse(archived[0].text), first.record);
});

test("force fallido preserva análisis válido y registra ERROR independiente", async (t) => {
  const { dependencies } = await setup(t);
  const first = await generateFicha(input, dependencies);
  const failure = await generateFicha(
    { ...input, force: true },
    {
      ...dependencies,
      generate: async () => {
        throw new Error("untrusted external error");
      },
    },
  );
  assert.equal(failure.status, "error");
  assert.equal(failure.record.estado, "ERROR");
  assert.equal(failure.record.analisis, null);
  assert.ok(failure.path.includes("historial"));
  const current = JSON.parse(await readFile(first.path, "utf8"));
  assert.deepEqual(current.analisis, first.record.analisis);
  assert.deepEqual(current.generacion, first.record.generacion);
  assert.equal(current.estado, "CREADO");
  assert.equal(current.revision, 1);
  assert.equal(current.intentos, 2);
  assert.equal(current.tuvo_error, true);
  assert.equal(current.error_actual, null);
  const retried = await generateFicha(input, dependencies);
  assert.equal(retried.status, "skipped");
  const forced = await generateFicha({ ...input, force: true }, dependencies);
  assert.equal(forced.record.revision, 2);
  assert.equal(forced.record.intentos, 3);
  assert.equal(forced.record.tuvo_error, true);
});

test("INCLUIDO se omite normalmente y rechaza force sin tocar revisión ni inclusión", async (t) => {
  const { dependencies, counters } = await setup(t);
  const first = await generateFicha(input, dependencies);
  const included = structuredClone(first.record);
  included.estado = "INCLUIDO";
  included.validacion = {
    ...included.validacion,
    apta_para_sintesis: true,
    coherencia_editorial_ok: true,
    trazabilidad_de_hallazgos_ok: true,
    validada_en: NOW,
  };
  included.inclusion_mensual = {
    mes: "2026-10",
    resumen_id: "resumen_sintetico_solo_para_pruebas",
    resumen_revision: 1,
    ficha_revision_incluida: 1,
    incluida_en: NOW,
  };
  await atomicWrite(first.path, included);
  assert.equal((await generateFicha(input, dependencies)).status, "skipped");
  const result = await generateFicha({ ...input, force: true }, dependencies);
  assert.equal(result.error.code, "INCLUIDO_NO_REGENERABLE");
  const preserved = JSON.parse(await readFile(first.path, "utf8"));
  assert.equal(preserved.estado, "INCLUIDO");
  assert.equal(preserved.revision, 1);
  assert.deepEqual(preserved.inclusion_mensual, included.inclusion_mensual);
  assert.deepEqual(counters, { retrieval: 1, generation: 1 });
});

test("rechaza forma/estados inconsistentes e identidad alterada", async (t) => {
  const { dependencies } = await setup(t);
  const result = await generateFicha(input, dependencies);
  for (const mutate of [
    (record) => {
      record.estado = "PENDIENTE";
    },
    (record) => {
      record.estado = "INCLUIDO";
    },
    (record) => {
      record.estado = "ERROR";
    },
    (record) => {
      record.error_actual = { mensaje: "incompleto" };
    },
    (record) => {
      record.lectura = null;
    },
    (record) => {
      record.fuente.url_normalizada += "#cambio";
    },
    (record) => {
      record.validacion.texto_completo_ok = false;
    },
    (record) => {
      record.extra = true;
    },
  ]) {
    const altered = structuredClone(result.record);
    mutate(altered);
    assert.throws(() => validateFicha(altered));
  }
});

test("ficha existente corrupta se conserva; diagnóstico separado, sin IA", async (t) => {
  const { dependencies, counters } = await setup(t);
  const path = await outputPath(
    createIdentity(DATE, URL),
    dependencies.env.FICHAS_DIR,
  );
  for (const text of ["{ parcial", "null", '{"estado":"CREADO"}']) {
    await writeFile(path, text);
    const result = await generateFicha({ ...input, force: true }, dependencies);
    assert.equal(result.status, "error");
    assert.notEqual(result.path, path);
    assert.equal(await readFile(path, "utf8"), text);
  }
  assert.deepEqual(counters, { retrieval: 0, generation: 0 });
});

test("escritura atómica: temporal en mismo directorio y fallo de rename preserva original", async (t) => {
  const { directory } = await setup(t);
  const path = join(directory, "ficha.json");
  await atomicWrite(path, { estado: "original" });
  await assert.rejects(
    atomicWrite(
      path,
      { estado: "replacement" },
      {
        renameFile: async (temporary, destination) => {
          assert.equal(dirname(temporary), dirname(destination));
          assert.deepEqual(JSON.parse(await readFile(temporary, "utf8")), {
            estado: "replacement",
          });
          assert.equal(
            JSON.parse(await readFile(destination, "utf8")).estado,
            "original",
          );
          throw new Error("controlled disk failure");
        },
      },
    ),
  );
  assert.equal(JSON.parse(await readFile(path, "utf8")).estado, "original");
  assert.deepEqual(await readdir(directory), ["ficha.json"]);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test("fallo al guardar regeneración: revisión anterior sigue íntegra y error trazable", async (t) => {
  const { dependencies } = await setup(t);
  const first = await generateFicha(input, dependencies);
  const result = await generateFicha(
    { ...input, force: true },
    {
      ...dependencies,
      write: (path, record, options) =>
        atomicWrite(path, record, {
          ...options,
          renameFile: async (source, target) => {
            if (path === first.path && record.revision === 2)
              throw new Error("controlled failure");
            await rename(source, target);
          },
        }),
    },
  );
  assert.equal(result.status, "error");
  assert.equal(result.record.error_actual.etapa, "PERSISTENCIA");
  assert.equal(JSON.parse(await readFile(first.path, "utf8")).revision, 1);
  assert.equal(JSON.parse(await readFile(result.path, "utf8")).estado, "ERROR");
});

test("bloqueo por identidad evita solicitudes duplicadas", async (t) => {
  const { dependencies, counters } = await setup(t);
  const path = await outputPath(
    createIdentity(DATE, URL),
    dependencies.env.FICHAS_DIR,
  );
  const release = await acquireLock(path);
  try {
    await assert.rejects(generateFicha(input, dependencies), {
      code: "EJECUCION_EN_CURSO",
    });
    assert.deepEqual(counters, { retrieval: 0, generation: 0 });
  } finally {
    await release();
  }
});

test("no filtra credenciales de errores externos, respuestas IA ni entorno en archivos/logs", async (t) => {
  const { dependencies, env, directory } = await setup(t);
  const logs = [];
  const code = await main(["--fecha", DATE, "--url", URL], {
    ...dependencies,
    generate: async () => {
      throw new Error(`external response ${env.GEMINI_API_KEY}`);
    },
    stdout: (line) => logs.push(line),
    stderr: (line) => logs.push(line),
  });
  assert.equal(code, 1);
  assert.ok(logs.every((line) => !line.includes(env.GEMINI_API_KEY)));
  assert.ok(
    (await contents(directory)).every(
      (file) => !file.text.includes(env.GEMINI_API_KEY),
    ),
  );
  const responseLeak = await generateFicha(
    { ...input, url: `${URL}?otra=1` },
    {
      ...dependencies,
      generate: async (document, options) => {
        const result = await mockGenerate(document, options);
        result.analisis.tema_principal = env.GEMINI_API_KEY;
        return result;
      },
    },
  );
  assert.equal(responseLeak.record.error_actual.codigo, "DATO_SENSIBLE");
  assert.ok(
    (await contents(directory)).every(
      (file) => !file.text.includes(env.GEMINI_API_KEY),
    ),
  );
});

test("configuración ausente produce ERROR con identidad válida y lectura honesta", async (t) => {
  const { dependencies, counters, env } = await setup(t);
  const result = await generateFicha(input, {
    ...dependencies,
    env: { FICHAS_DIR: env.FICHAS_DIR },
  });
  assert.equal(result.record.error_actual.codigo, "CONFIGURACION_FALTANTE");
  assert.equal(result.record.generacion.modelo, null);
  assert.equal(result.record.generacion.solicitudes_ia, 0);
  assert.equal(result.record.lectura.texto_completo_verificado, true);
  assert.equal(counters.generation, 0);
});

test("CLI: errores de entrada no escriben; help y env-file funcionan fuera de la raíz", async (t) => {
  const { dependencies, directory } = await setup(t);
  const messages = [];
  const code = await main(["--fecha", "2026-02-30", "--url", URL], {
    ...dependencies,
    stderr: (text) => messages.push(text),
  });
  assert.equal(code, 2);
  assert.match(messages[0], /FECHA_INVALIDA/);
  assert.deepEqual(await readdir(directory), []);
  const config = join(directory, "local.env");
  await writeFile(config, "GEMINI_MODEL=\nGEMINI_API_KEY=\n");
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      `--env-file=${config}`,
      join(ROOT, "scripts/fichas/generar-ficha.mjs"),
      "--help",
    ],
    { cwd: directory },
  );
  assert.match(stdout, /No lee fuentes.tsv/);
  const result = await generateFicha(input, {
    ...dependencies,
    env: { ...dependencies.env, FICHAS_DIR: relative(ROOT, directory) },
  });
  assert.ok(result.path.startsWith(directory));
});

test("salida public rechazada incluso mediante enlaces simbólicos", async (t) => {
  const { directory } = await setup(t);
  const identity = createIdentity(DATE, URL);
  await assert.rejects(outputPath(identity, "public/fichas-prohibidas"), {
    code: "SALIDA_PUBLICA_RECHAZADA",
  });
  const link = join(directory, "public-alias");
  await symlink(join(ROOT, "public"), link);
  await assert.rejects(outputPath(identity, join(link, "fichas-prohibidas")), {
    code: "SALIDA_PUBLICA_RECHAZADA",
  });
});
