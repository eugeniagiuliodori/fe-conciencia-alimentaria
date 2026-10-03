import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { createIdentity, FichaError, ROOT } from "./core.mjs";
import { generateFicha } from "./generar-ficha.mjs";
import { main, parseArgs, processFicha } from "./procesar-ficha.mjs";
import { validateFicha } from "./schema.mjs";
import {
  acquireLock,
  atomicWrite,
  outputPath,
  readExisting,
} from "./storage.mjs";
import {
  DATE,
  documentFixture,
  mockGenerate,
  NOW,
  URL,
} from "./test-support.mjs";

const execFileAsync = promisify(execFile);
const input = { date: DATE, url: URL };
const args = ["--fecha", DATE, "--url", URL];
const identity = createIdentity(DATE, URL);

async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), "procesar-ficha-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fetchMock = t.mock.method(globalThis, "fetch", () => {
    assert.fail("Las pruebas del procesador no deben acceder a la red.");
  });
  t.after(() => assert.equal(fetchMock.mock.callCount(), 0));
  const env = {
    FICHAS_DIR: directory,
    GEMINI_API_KEY: randomUUID(),
    GEMINI_MODEL: "modelo-artificial-solo-en-mocks",
  };
  const counters = { generator: 0, retrieval: 0, generation: 0 };
  const generatorDependencies = {
    env,
    now: () => NOW,
    retrieve: async () => {
      counters.retrieval += 1;
      return documentFixture();
    },
    generate: async (...parameters) => {
      counters.generation += 1;
      return mockGenerate(...parameters);
    },
  };
  const dependencies = {
    env,
    runGenerator: async (options, overrides) => {
      counters.generator += 1;
      assert.deepEqual(options, {
        date: options.date,
        url: options.url,
        force: false,
      });
      return generateFicha(options, {
        ...generatorDependencies,
        ...overrides,
      });
    },
  };
  return { directory, env, counters, dependencies, generatorDependencies };
}

async function snapshot(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await snapshot(path)));
    else
      files.push({
        path,
        text: await readFile(path, "utf8"),
        mtime: (await stat(path)).mtimeMs,
      });
  }
  return files;
}

function assertUnreviewed(record) {
  assert.equal(record.validacion.apta_para_sintesis, false);
  assert.equal(record.validacion.trazabilidad_de_hallazgos_ok, false);
  assert.equal(record.validacion.coherencia_editorial_ok, false);
  assert.equal(record.validacion.validada_en, null);
  assert.equal(record.inclusion_mensual, null);
  assert.equal(Object.hasOwn(record, "estadoPublicacion"), false);
}

// These states describe artificial fixtures only, not actual editorial checks.
function reviewedFixture(record, state) {
  const fixture = structuredClone(record);
  fixture.estado = state;
  fixture.validacion = {
    ...fixture.validacion,
    apta_para_sintesis: true,
    trazabilidad_de_hallazgos_ok: true,
    coherencia_editorial_ok: true,
    validada_en: NOW,
  };
  if (state === "INCLUIDO")
    fixture.inclusion_mensual = {
      mes: identity.month,
      resumen_id: "resumen_artificial_solo_para_pruebas",
      resumen_revision: 1,
      ficha_revision_incluida: record.revision,
      incluida_en: NOW,
    };
  return fixture;
}

test("CLI: tres entradas lógicas; key omitida es null y key hexadecimal admite mayúsculas", () => {
  assert.deepEqual(parseArgs(args), {
    ...input,
    idempotencyKey: null,
    help: false,
  });
  assert.deepEqual(parseArgs(["--key", identity.key, ...args]), {
    ...input,
    idempotencyKey: identity.key,
    help: false,
  });
  const original = "  https://EJEMPLO.org:443/a/../b?z=%2f&a=2#Frag\n";
  const key = createIdentity(DATE, original).key.toUpperCase();
  assert.equal(
    parseArgs(["--key", key, "--url", original, "--fecha", DATE]).url,
    original,
  );
  assert.equal(parseArgs(["--help"]).help, true);
});

test("entradas inválidas se detienen antes de leer, generar o crear directorios", async (t) => {
  const { directory, dependencies, counters } = await setup(t);
  const options = {
    ...dependencies,
    env: { FICHAS_DIR: join(directory, "no-debe-crearse") },
    read: async () => assert.fail("No debe leer fichas con entradas inválidas"),
  };
  for (const invalid of [
    [],
    ["--fecha", DATE],
    ["--url", URL],
    ["--fecha"],
    ["--url", "--fecha", DATE],
    ["--key"],
    ["--key", "--fecha", DATE, "--url", URL],
    ["--key", "null", ...args],
    ["--key", "../ficha.json", ...args],
    ["--key", "a".repeat(63), ...args],
    ["--key", "g".repeat(64), ...args],
    ["--key", `${identity.key}\n`, ...args],
    ["--key", "0".repeat(64), ...args],
    ["--key", identity.key, "--key", identity.key, ...args],
    [...args, "--fecha", DATE],
    [...args, "--force"],
    [...args, "--otro"],
    [...args, "suelto"],
    ["--fecha", "2026-02-29", "--url", URL],
    ["--fecha", "2026-04-31", "--url", URL],
    ["--fecha", "2026-1-01", "--url", URL],
    ["--fecha", DATE, "--url", "ftp://ejemplo.org/articulo"],
    ["--fecha", DATE, "--url", "/articulo"],
    ["--fecha", DATE, "--url", "https://usuario:clave@ejemplo.org"],
    ["--fecha", DATE, "--url", `${URL}\ninterno`],
  ]) {
    const messages = [];
    assert.equal(
      await main(invalid, {
        ...options,
        stdout: () => assert.fail("No debe informar éxito"),
        stderr: (message) => messages.push(message),
      }),
      2,
    );
    assert.equal(messages.length, 1);
  }
  for (const invalid of [
    {},
    { date: DATE },
    { url: URL },
    { ...input, idempotencyKey: 123 },
    { ...input, idempotencyKey: "null" },
    { ...input, idempotencyKey: "0".repeat(64) },
    { ...input, date: "0000-01-01" },
    { ...input, url: "https:///" },
  ])
    await assert.rejects(processFicha(invalid, options), { stage: "ENTRADA" });
  assert.deepEqual(counters, { generator: 0, retrieval: 0, generation: 0 });
  assert.deepEqual(await readdir(directory), []);
});

for (const [label, key] of [
  ["omitida", undefined],
  ["null lógico", null],
  ["minúscula", identity.key],
  ["mayúscula", identity.key.toUpperCase()],
])
  test(`ficha ausente genera una sola vez en CREADO (key ${label})`, async (t) => {
    const { directory, dependencies, counters } = await setup(t);
    const first = await processFicha(
      key === undefined ? input : { ...input, idempotencyKey: key },
      dependencies,
    );
    assert.equal(first.status, "created");
    assert.equal(first.retried, false);
    assert.equal(
      first.path,
      join(directory, identity.month, `ficha_${DATE}_${identity.key}.json`),
    );
    const stored = validateFicha(
      JSON.parse(await readFile(first.path, "utf8")),
      identity,
    );
    assert.deepEqual(first.record, stored);
    assert.equal(stored.estado, "CREADO");
    assert.equal(stored.error_actual, null);
    assert.equal(stored.revision, 1);
    assert.equal(stored.intentos, 1);
    assertUnreviewed(stored);
    const before = await snapshot(directory);
    const second = await processFicha(input, {
      ...dependencies,
      env: { FICHAS_DIR: directory },
    });
    assert.equal(second.status, "skipped");
    assert.deepEqual(second.record, stored);
    assert.deepEqual(counters, { generator: 1, retrieval: 1, generation: 1 });
    assert.deepEqual(await snapshot(directory), before);
    assert.equal(before.length, 1);
  });

test("key discordante no altera una ficha existente ni su historial", async (t) => {
  const { directory, dependencies, counters } = await setup(t);
  await processFicha(input, dependencies);
  const before = await snapshot(directory);
  await assert.rejects(
    processFicha({ ...input, idempotencyKey: "0".repeat(64) }, dependencies),
    { code: "KEY_DISCORDANTE" },
  );
  assert.deepEqual(await snapshot(directory), before);
  assert.equal(counters.generator, 1);
});

test("ERROR se reintenta sin borrarlo y el generador conserva intentos, revisión e historial", async (t) => {
  const { directory, dependencies, generatorDependencies, counters } =
    await setup(t);
  const retrieve = generatorDependencies.retrieve;
  generatorDependencies.retrieve = async () => {
    throw new FichaError(
      "COBERTURA",
      "COBERTURA_INSUFICIENTE",
      "Documento artificial incompleto.",
    );
  };
  const first = await processFicha(input, dependencies);
  assert.equal(first.status, "error");
  assert.equal(first.record.estado, "ERROR");
  assert.equal(first.record.analisis, null);
  assertUnreviewed(first.record);
  const errorText = await readFile(first.path, "utf8");
  generatorDependencies.retrieve = retrieve;
  generatorDependencies.now = () => "2026-10-02T18:00:00.000Z";
  const recovered = await processFicha(input, {
    ...dependencies,
    runGenerator: async (...parameters) => {
      assert.equal(await readFile(first.path, "utf8"), errorText);
      return dependencies.runGenerator(...parameters);
    },
  });
  assert.equal(recovered.status, "created");
  assert.equal(recovered.retried, true);
  assert.equal(recovered.record.estado, "CREADO");
  assert.equal(recovered.record.error_actual, null);
  assert.equal(recovered.record.tuvo_error, true);
  assert.equal(recovered.record.intentos, 2);
  assert.equal(recovered.record.revision, 2);
  assert.equal(recovered.record.creado_en, first.record.creado_en);
  assertUnreviewed(recovered.record);
  assert.equal(counters.generator, 2);
  assert.equal(counters.generation, 1);
  const history = (await snapshot(directory)).filter((file) =>
    file.path.includes("historial"),
  );
  assert.equal(history.length, 1);
  assert.deepEqual(JSON.parse(history[0].text), first.record);
});

test("reintento fallido permanece ERROR y la CLI informa fallo, sin promoción", async (t) => {
  const { directory, dependencies, generatorDependencies, counters } =
    await setup(t);
  generatorDependencies.retrieve = async () => {
    throw new FichaError(
      "RECUPERACION",
      "TEXTO_COMPLETO_NO_DISPONIBLE",
      "Fallo artificial de recuperación.",
    );
  };
  const first = await processFicha(input, dependencies);
  const logs = [];
  assert.equal(
    await main(args, {
      ...dependencies,
      stdout: () => assert.fail("Un reintento fallido no es éxito"),
      stderr: (message) => logs.push(message),
    }),
    1,
  );
  const record = validateFicha(await readExisting(first.path), identity);
  assert.equal(record.estado, "ERROR");
  assert.equal(record.error_actual.codigo, "TEXTO_COMPLETO_NO_DISPONIBLE");
  assert.equal(record.intentos, 2);
  assert.equal(record.revision, 1);
  assert.equal(record.tuvo_error, true);
  assert.equal(record.analisis, null);
  assertUnreviewed(record);
  assert.equal(counters.generator, 2);
  assert.equal(counters.generation, 0);
  assert.match(logs[0], /Reintento fallido.*TEXTO_COMPLETO_NO_DISPONIBLE/);
  assert.match(logs[0], /Diagnóstico ERROR verificado/);
  const history = (await snapshot(directory)).filter((file) =>
    file.path.includes("historial"),
  );
  assert.deepEqual(
    history.map((file) => JSON.parse(file.text)),
    [first.record],
  );
});

for (const state of ["CREADO", "PENDIENTE", "INCLUIDO"])
  test(`${state} consistente se reutiliza intacto, sin credenciales ni invocar al generador`, async (t) => {
    const { directory, dependencies } = await setup(t);
    const first = await processFicha(input, dependencies);
    if (state !== "CREADO")
      await atomicWrite(first.path, reviewedFixture(first.record, state));
    const before = await snapshot(directory);
    const logs = [];
    const reads = [];
    assert.equal(
      await main(args, {
        env: { FICHAS_DIR: directory },
        runGenerator: async () => assert.fail("No debe invocar al generador"),
        read: async (path) => {
          reads.push(path);
          return readExisting(path);
        },
        stdout: (message) => logs.push(message),
        stderr: () => assert.fail("La reutilización no necesita credenciales"),
      }),
      0,
    );
    assert.deepEqual(reads, [first.path]);
    assert.deepEqual(await snapshot(directory), before);
    assert.match(
      logs[0],
      new RegExp(`Ficha reutilizada sin cambios \\(${state}\\)`),
    );
    assert.equal((await readExisting(first.path)).estado, state);
  });

test("JSON corrupto o no objeto no se reemplaza ni genera diagnósticos nuevos", async (t) => {
  const { directory, dependencies, counters } = await setup(t);
  const path = await outputPath(identity, directory);
  for (const content of ["{ parcial", "null", "[]", "{}", '"texto"']) {
    await writeFile(path, content);
    const before = await snapshot(directory);
    await assert.rejects(
      processFicha(input, dependencies),
      (error) =>
        ["ARCHIVO_EXISTENTE_INVALIDO", "FICHA_INCONSISTENTE"].includes(error.code),
    );
    assert.deepEqual(await snapshot(directory), before);
  }
  assert.deepEqual(counters, { generator: 0, retrieval: 0, generation: 0 });
});

test("identidad, estado y validación inconsistentes impiden la reutilización y la generación", async (t) => {
  const { directory, dependencies, counters } = await setup(t);
  const first = await processFicha(input, dependencies);
  for (const mutate of [
    (record) => {
      record.estado = "DESCONOCIDO";
    },
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
      record.analisis = null;
    },
    (record) => {
      record.lectura.texto_completo_verificado = false;
    },
    (record) => {
      record.validacion.apta_para_sintesis = true;
    },
    (record) => {
      record.fuente.url_normalizada += "#modificada";
    },
    (record) => {
      record.fuente.fecha_noticia = "2026-02-30";
    },
    (record) => {
      record.idempotency_key = "0".repeat(64);
    },
    (record) => {
      const other = createIdentity(DATE, `${URL}#otra`);
      record.fuente.url_original = other.originalUrl;
      record.fuente.url_normalizada = other.url;
      record.idempotency_key = other.key;
    },
  ]) {
    const record = structuredClone(first.record);
    mutate(record);
    await atomicWrite(first.path, record);
    const before = await snapshot(directory);
    await assert.rejects(processFicha(input, dependencies), {
      code: "FICHA_INCONSISTENTE",
      stage: "VALIDACION_JSON",
    });
    assert.deepEqual(await snapshot(directory), before);
  }
  assert.equal(counters.generator, 1);
});

test("fallas de lectura y rutas no regulares tienen diagnóstico seguro y no invocan generación", async (t) => {
  const { directory, env, dependencies, counters } = await setup(t);
  const path = await outputPath(identity, directory);
  await mkdir(path);
  await assert.rejects(processFicha(input, dependencies), {
    code: "ARCHIVO_EXISTENTE_INVALIDO",
  });
  assert.equal((await stat(path)).isDirectory(), true);
  const logs = [];
  assert.equal(
    await main(args, {
      ...dependencies,
      read: async () => {
        throw Object.assign(new Error(env.GEMINI_API_KEY), { code: "EACCES" });
      },
      stderr: (message) => logs.push(message),
    }),
    1,
  );
  assert.match(logs[0], /LECTURA_FALLIDA/);
  assert.ok(!logs[0].includes(env.GEMINI_API_KEY));
  assert.equal(counters.generator, 0);
  assert.deepEqual(await readdir(dirname(path)), [basename(path)]);
});

test("un éxito informado sin archivo persistido no se considera una ficha creada", async (t) => {
  const { directory, env } = await setup(t);
  const path = await outputPath(identity, directory);
  let calls = 0;
  await assert.rejects(
    processFicha(input, {
      env,
      runGenerator: async () => {
        calls += 1;
        return { status: "created", path };
      },
    }),
    { code: "RESULTADO_NO_PERSISTIDO" },
  );
  assert.equal(calls, 1);
  assert.deepEqual(await readdir(dirname(path)), []);
});

test("la verificación posterior usa el JSON persistido, no una copia retornada por el generador", async (t) => {
  const { dependencies } = await setup(t);
  const result = await processFicha(input, {
    ...dependencies,
    runGenerator: async (...parameters) => ({
      ...(await dependencies.runGenerator(...parameters)),
      record: { estado: "INCLUIDO" },
    }),
  });
  assert.equal(result.record.estado, "CREADO");
  assertUnreviewed(result.record);
});

test("rechaza resultados y archivos inconsistentes después de invocar al generador", async (t) => {
  for (const [name, change, code] of [
    [
      "resultado ausente",
      async () => undefined,
      "RESULTADO_GENERADOR_INCONSISTENTE",
    ],
    [
      "status desconocido",
      async (result) => ({ ...result, status: "unexpected" }),
      "RESULTADO_GENERADOR_INCONSISTENTE",
    ],
    [
      "ruta diferente",
      async (result) => ({ ...result, path: `${result.path}.otro` }),
      "RESULTADO_GENERADOR_INCONSISTENTE",
    ],
    [
      "JSON corrupto",
      async (result) => {
        await writeFile(result.path, "{ parcial");
        return result;
      },
      "ARCHIVO_EXISTENTE_INVALIDO",
    ],
    [
      "identidad discordante",
      async (result) => {
        await atomicWrite(result.path, {
          ...result.record,
          idempotency_key: "0".repeat(64),
        });
        return result;
      },
      "FICHA_INCONSISTENTE",
    ],
    [
      "promoción inesperada",
      async (result) => {
        await atomicWrite(
          result.path,
          reviewedFixture(result.record, "PENDIENTE"),
        );
        return result;
      },
      "RESULTADO_GENERADOR_INCONSISTENTE",
    ],
    [
      "error sin ERROR persistido",
      async (result) => ({ ...result, status: "error" }),
      "RESULTADO_GENERADOR_INCONSISTENTE",
    ],
  ])
    await t.test(name, async (t) => {
      const { directory, dependencies, counters } = await setup(t);
      let afterGenerator;
      await assert.rejects(
        processFicha(input, {
          ...dependencies,
          runGenerator: async (...parameters) => {
            const result = await change(
              await dependencies.runGenerator(...parameters),
            );
            afterGenerator = await snapshot(directory);
            return result;
          },
        }),
        { code },
      );
      assert.equal(counters.generator, 1);
      assert.deepEqual(await snapshot(directory), afterGenerator);
    });
});

test(
  "concurrencia: respeta el lock activo sin borrarlo y evita IA duplicada",
  { timeout: 5000 },
  async (t) => {
    const { directory, dependencies, generatorDependencies, counters } =
      await setup(t);
    const started = Promise.withResolvers();
    const proceed = Promise.withResolvers();
    const retrieve = generatorDependencies.retrieve;
    generatorDependencies.retrieve = async (...parameters) => {
      started.resolve();
      await proceed.promise;
      return retrieve(...parameters);
    };
    const first = processFicha(input, dependencies);
    const path = await outputPath(identity, directory);
    try {
      await started.promise;
      const before = await readFile(`${path}.lock`, "utf8");
      await assert.rejects(processFicha(input, dependencies), {
        code: "EJECUCION_EN_CURSO",
      });
      assert.equal(await readFile(`${path}.lock`, "utf8"), before);
      assert.equal(counters.generation, 0);
    } finally {
      proceed.resolve();
      await first;
    }
    assert.equal((await first).record.estado, "CREADO");
    assert.equal((await processFicha(input, dependencies)).status, "skipped");
    assert.deepEqual(counters, { generator: 2, retrieval: 1, generation: 1 });
    assert.equal((await snapshot(directory)).length, 1);
  },
);

test("reutilizar un registro completo no modifica un lock existente", async (t) => {
  const { directory, dependencies, counters } = await setup(t);
  const first = await processFicha(input, dependencies);
  const release = await acquireLock(first.path);
  try {
    const before = await snapshot(directory);
    assert.equal((await processFicha(input, dependencies)).status, "skipped");
    assert.deepEqual(await snapshot(directory), before);
    assert.equal(counters.generator, 1);
  } finally {
    await release();
  }
});

test("si otra ejecución completó la ficha entre lectura y generación, acepta skipped del generador", async (t) => {
  const { dependencies, generatorDependencies, counters } = await setup(t);
  const result = await processFicha(input, {
    ...dependencies,
    runGenerator: async (...parameters) => {
      await generateFicha(input, generatorDependencies);
      return dependencies.runGenerator(...parameters);
    },
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.record.estado, "CREADO");
  assert.equal(result.retried, false);
  assert.equal(counters.generation, 1);
});

test("si el archivo se corrompe entre lecturas, verifica el diagnóstico separado del generador", async (t) => {
  const { directory, dependencies, counters } = await setup(t);
  const path = await outputPath(identity, directory);
  const result = await processFicha(input, {
    ...dependencies,
    runGenerator: async (...parameters) => {
      await writeFile(path, "{ corrupto");
      return dependencies.runGenerator(...parameters);
    },
  });
  assert.equal(result.status, "error");
  assert.equal(result.preservedPath, path);
  assert.match(result.path, /historial/);
  assert.equal(result.record.estado, "ERROR");
  assert.equal(result.record.error_actual.codigo, "ARCHIVO_EXISTENTE_INVALIDO");
  assert.equal(await readFile(path, "utf8"), "{ corrupto");
  assert.deepEqual(await readExisting(result.path), result.record);
  assert.deepEqual(counters, { generator: 1, retrieval: 0, generation: 0 });
});

test("fallo de persistencia no se informa como éxito ni diagnóstico guardado", async (t) => {
  const { directory, dependencies, generatorDependencies } = await setup(t);
  generatorDependencies.write = async () => {
    throw new Error("Fallo artificial de disco");
  };
  const logs = [];
  assert.equal(
    await main(args, {
      ...dependencies,
      stdout: () => assert.fail("No hay éxito de persistencia"),
      stderr: (message) => logs.push(message),
    }),
    1,
  );
  assert.match(logs[0], /ERROR_NO_PERSISTIDO/);
  assert.ok(!logs[0].includes("Diagnóstico ERROR verificado"));
  assert.deepEqual(await snapshot(directory), []);
});

test("credenciales artificiales no se filtran por errores, respuestas ni rutas", async (t) => {
  const { directory, env, dependencies, generatorDependencies } =
    await setup(t);
  generatorDependencies.generate = async () => {
    throw new Error(`Proveedor: ${env.GEMINI_API_KEY}`);
  };
  const logs = [];
  assert.equal(
    await main(args, {
      ...dependencies,
      stderr: (message) => logs.push(message),
    }),
    1,
  );
  assert.match(logs[0], /Generación fallida/);
  assert.ok(logs.every((message) => !message.includes(env.GEMINI_API_KEY)));
  assert.ok(
    (await snapshot(directory)).every(
      (file) => !file.text.includes(env.GEMINI_API_KEY),
    ),
  );
  generatorDependencies.generate = async (...parameters) => {
    const result = await mockGenerate(...parameters);
    result.analisis.tema_principal = env.GEMINI_API_KEY;
    return result;
  };
  const leaked = await processFicha(input, dependencies);
  assert.equal(leaked.record.error_actual.codigo, "DATO_SENSIBLE");
  assertUnreviewed(leaked.record);
  assert.ok(
    (await snapshot(directory)).every(
      (file) => !file.text.includes(env.GEMINI_API_KEY),
    ),
  );
  const before = await snapshot(directory);
  for (const [options, configuration] of [
    [{ ...input, url: `${URL}?secret=${env.GEMINI_API_KEY}` }, env],
    [input, { ...env, FICHAS_DIR: join(directory, env.GEMINI_API_KEY) }],
  ])
    await assert.rejects(
      processFicha(options, { ...dependencies, env: configuration }),
      { code: "DATO_SENSIBLE" },
    );
  assert.deepEqual(await snapshot(directory), before);
});

test("rechaza datos sensibles en una ficha existente sin modificarla", async (t) => {
  const { directory, env, dependencies, counters } = await setup(t);
  const first = await processFicha(input, dependencies);
  first.record.analisis.tema_principal = env.GEMINI_API_KEY;
  await writeFile(first.path, JSON.stringify(first.record));
  const before = await snapshot(directory);
  const logs = [];
  assert.equal(
    await main(args, {
      ...dependencies,
      stderr: (message) => logs.push(message),
    }),
    1,
  );
  assert.match(logs[0], /DATO_SENSIBLE/);
  assert.ok(!logs[0].includes(env.GEMINI_API_KEY));
  assert.deepEqual(await snapshot(directory), before);
  assert.equal(counters.generator, 1);
});

test("FICHAS_DIR conserva resolución desde la raíz y rechazo de public", async (t) => {
  const { directory, dependencies, counters } = await setup(t);
  const first = await processFicha(input, {
    ...dependencies,
    env: { ...dependencies.env, FICHAS_DIR: relative(ROOT, directory) },
  });
  assert.ok(first.path.startsWith(directory));
  await assert.rejects(
    processFicha(input, {
      ...dependencies,
      env: { FICHAS_DIR: "public/fichas-prohibidas" },
    }),
    { code: "SALIDA_PUBLICA_RECHAZADA" },
  );
  assert.equal(counters.generator, 1);
});

test("CLI real: importación y ayuda sin efectos, env-file fuera de raíz y reutilización sin credenciales", async (t) => {
  const { directory, dependencies } = await setup(t);
  const script = join(ROOT, "scripts/fichas/procesar-ficha.mjs");
  const childEnv = { PATH: process.env.PATH, FICHAS_DIR: directory };
  const imported = await execFileAsync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `globalThis.fetch = () => { throw new Error('Red no permitida'); }; await import(${JSON.stringify(pathToFileURL(script).href)});`,
    ],
    { cwd: directory, env: childEnv },
  );
  assert.equal(imported.stdout, "");
  assert.equal(imported.stderr, "");
  assert.deepEqual(await readdir(directory), []);
  const config = join(directory, "local.env");
  await writeFile(config, "GEMINI_MODEL=\nGEMINI_API_KEY=\n");
  const help = await execFileAsync(
    process.execPath,
    [`--env-file=${config}`, script, "--help"],
    { cwd: directory, env: childEnv },
  );
  assert.match(help.stdout, /No lee fuentes.tsv/);
  assert.match(help.stdout, /No realiza validación editorial/);
  assert.deepEqual(await readdir(directory), ["local.env"]);
  await assert.rejects(
    execFileAsync(process.execPath, [script, ...args, "--key", "null"], {
      cwd: directory,
      env: childEnv,
    }),
    (error) => error.code === 2 && /KEY_INVALIDA/.test(error.stderr),
  );
  const first = await processFicha(input, dependencies);
  const before = await snapshot(directory);
  const reused = await execFileAsync(
    process.execPath,
    [script, ...args, "--key", identity.key],
    { cwd: directory, env: childEnv },
  );
  assert.match(reused.stdout, /Ficha reutilizada sin cambios \(CREADO\)/);
  assert.ok(reused.stdout.includes(first.path));
  assert.equal(reused.stderr, "");
  assert.deepEqual(await snapshot(directory), before);
  const packageJson = JSON.parse(
    await readFile(join(ROOT, "package.json"), "utf8"),
  );
  assert.ok(
    Object.values(packageJson.scripts).every(
      (command) => !command.includes("procesar-ficha.mjs"),
    ),
  );
});
