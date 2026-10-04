import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import {
  retrieveDocumentWithHumanVerification,
  retrieveInBrowser,
  waitForHuman,
} from "./browser-retrieval.mjs";
import { createIdentity, sha256 } from "./core.mjs";
import { generateFicha } from "./generar-ficha.mjs";
import { processFicha } from "./procesar-ficha.mjs";
import {
  HumanVerificationError,
  MAX_DOCUMENT_BYTES,
  retrieveDocument,
} from "./retrieval.mjs";
import { outputPath } from "./storage.mjs";
import {
  DATE,
  htmlDocument,
  mockGenerate,
  NOW,
  paragraph,
  URL,
} from "./test-support.mjs";

const CHALLENGE =
  "<html><title>Client Challenge</title><body>Verificación</body></html>";
const htmlResponse = (text, status = 200) =>
  new Response(text, { status, headers: { "content-type": "text/html" } });

test.beforeEach((t) => {
  t.mock.method(globalThis, "fetch", () => {
    assert.fail("Estas pruebas no deben acceder a la red ni a Gemini.");
  });
});

function browserFixture(
  t,
  { markup = htmlDocument(), status = 200, headers = {} } = {},
) {
  const calls = {
    launch: [], context: [], navigation: [], confirmation: 0, close: 0,
  };
  const logs = [];
  const input = new PassThrough();
  const output = new PassThrough();
  input.isTTY = true;
  output.isTTY = true;
  output.on("data", (value) => logs.push(value.toString()));
  t.after(() => {
    input.destroy();
    output.destroy();
  });
  const env = {
    PATH: "/ruta/artificial",
    GEMINI_API_KEY: randomUUID(),
    GEMINI_MODEL: "modelo-artificial-solo-en-mocks",
    OTRO_SECRETO: "no-heredar",
    NODE_OPTIONS: "no-heredar",
  };
  const page = new EventEmitter();
  const browser = new EventEmitter();
  const signals = new EventEmitter();
  const response = {
    url: () => URL,
    status: () => status,
    allHeaders: async () => ({ "content-type": "text/html", ...headers }),
    body: async () => Buffer.from(markup),
  };
  page.goto = async (url, options) => {
    calls.navigation.push({ url, options });
    return response;
  };
  page.content = () =>
    assert.fail("No reconstruir cierres con el DOM del navegador.");
  const context = { newPage: async () => page };
  browser.newContext = async (options) => {
    calls.context.push(options);
    return context;
  };
  browser.close = async () => {
    calls.close += 1;
    browser.emit("disconnected");
  };
  const options = {
    env,
    input,
    output,
    signals,
    now: () => NOW,
    fetchImpl: async () => htmlResponse(CHALLENGE),
    launchBrowser: async (options) => {
      calls.launch.push(options);
      return browser;
    },
    confirmAccess: async () => {
      calls.confirmation += 1;
    },
  };
  t.after(() => {
    for (const name of ["SIGINT", "SIGTERM", "SIGHUP"])
      assert.equal(signals.listenerCount(name), 0);
    assert.equal(page.listenerCount("close"), 0);
    assert.equal(browser.listenerCount("disconnected"), 0);
  });
  return { options, calls, logs, env, page, browser, response, signals };
}

test("detecta Client Challenge y verificación humana en HTML 200 y bloqueos HTTP", async () => {
  for (const status of [200, 401, 403, 429, 503])
    for (const markup of [
      CHALLENGE,
      "<title>Verify you are human</title>",
      "<h1>Checking your browser</h1>",
      '<div id="challenge-form">Verificación</div>',
    ])
      await assert.rejects(
        retrieveDocument(URL, {
          fetchImpl: async () => htmlResponse(markup, status),
        }),
        (error) =>
          error instanceof HumanVerificationError &&
          error.code === "TEXTO_COMPLETO_NO_DISPONIBLE",
      );
});

test("acceso directo íntegro no abre navegador ni requiere terminal", async (t) => {
  const fixture = browserFixture(t);
  const document = await retrieveDocumentWithHumanVerification(URL, {
    ...fixture.options,
    input: { isTTY: false },
    fetchImpl: async () => htmlResponse(htmlDocument()),
  });
  assert.equal(document.reading.texto_completo_verificado, true);
  assert.equal(fixture.calls.launch.length, 0);
  assert.equal(fixture.calls.confirmation, 0);
});

test("no abre navegador por paywall, abstract, error HTTP o de red genérico", async (t) => {
  const fixture = browserFixture(t);
  for (const fetchImpl of [
    async () => htmlResponse("<title>Purchase this article</title>"),
    async () => htmlResponse(htmlDocument([["Abstract", "Solo resumen."]])),
    async () => htmlResponse("<title>Access denied</title>", 403),
    async () => {
      throw new Error("Fallo de red artificial");
    },
  ])
    await assert.rejects(
      retrieveDocumentWithHumanVerification(URL, {
        ...fixture.options,
        fetchImpl,
      }),
    );
  assert.equal(fixture.calls.launch.length, 0);
});

test("confirmación humana: misma sesión, URL original, extracción real y entorno sin secretos", async (t) => {
  const { options, calls, env, logs } = browserFixture(t);
  const document = await retrieveDocumentWithHumanVerification(URL, options);
  assert.equal(calls.launch.length, 1);
  assert.deepEqual(calls.launch[0].env, { PATH: env.PATH });
  assert.equal(calls.launch[0].channel, "chrome");
  assert.equal(calls.launch[0].headless, false);
  assert.equal(calls.launch[0].chromiumSandbox, true);
  assert.deepEqual(calls.context, [{ acceptDownloads: false, viewport: null }]);
  assert.equal(calls.confirmation, 1);
  assert.deepEqual(calls.navigation.map(({ url }) => url), [URL, URL]);
  assert.equal(calls.close, 1);
  assert.equal(document.resolvedUrl, URL);
  assert.equal(document.reading.texto_completo_verificado, true);
  assert.equal(
    document.reading.sha256_contenido_extraido,
    sha256(document.text),
  );
  assert.equal(document.reading.metodo_recuperacion, "OTRO");
  assert.match(document.reading.alcance_y_observaciones, /sesión temporal/);
  assert.ok(!document.reading.alcance_y_observaciones.includes("GET directo"));
  assert.ok(
    !JSON.stringify({ document, logs, calls }).includes(env.GEMINI_API_KEY),
  );
});

test("varias cookies de respuesta no impiden leer HTML ni se copian al documento", async (t) => {
  const cookie = "cookie-artificial-solo-para-pruebas";
  const { options, calls, logs } = browserFixture(t, {
    headers: {
      "set-cookie": `access_mock=${cookie}; HttpOnly; Path=/\nprefs_mock=${cookie}; Path=/`,
      "content-length": String(Buffer.byteLength(htmlDocument())),
    },
  });
  const document = await retrieveDocumentWithHumanVerification(URL, options);
  assert.equal(document.reading.texto_completo_verificado, true);
  assert.equal(
    document.reading.sha256_contenido_extraido,
    sha256(document.text),
  );
  assert.equal(calls.close, 1);
  assert.ok(!JSON.stringify({ document, logs }).includes(cookie));
});

test("acceso confirmado con abstract estructurado y metadatos persiste el motivo de cobertura sin IA", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ficha-browser-abstract-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // Deliberately long metadata must not make the structured abstract sufficient.
  const abstract = ["Background", "Methods", "Results", "Conclusions"]
    .map((heading) => `<h3>${heading}</h3><p>${paragraph("Resumen artificial")}</p>`)
    .join("");
  const markup = htmlDocument([
    ["Abstract", ""],
    ["Author information", paragraph("Metadatos artificiales", 30)],
  ]).replace("<h2>Abstract</h2>", `<h2>Abstract</h2>${abstract}`);
  const fixture = browserFixture(t, {
    markup,
    headers: { "set-cookie": "access_mock=1; HttpOnly\nprefs_mock=1" },
  });
  let generated = 0;
  const result = await processFicha(
    { date: DATE, url: URL },
    {
      env: { ...fixture.env, FICHAS_DIR: directory },
      runGenerator: (parameters, overrides) =>
        generateFicha(parameters, {
          ...overrides,
          now: () => NOW,
          retrieve: (url, options) =>
            retrieveDocumentWithHumanVerification(url, {
              ...fixture.options, ...options,
            }),
          generate: (...args) => {
            generated += 1;
            return mockGenerate(...args);
          },
        }),
    },
  );
  assert.equal(result.status, "error");
  assert.equal(result.record.estado, "ERROR");
  assert.equal(result.record.error_actual.codigo, "COBERTURA_INSUFICIENTE");
  assert.match(result.record.error_actual.mensaje, /fuera del abstract/);
  assert.match(
    result.record.error_actual.mensaje,
    /se requieren 300 palabras/,
  );
  assert.equal(result.record.lectura.texto_completo_verificado, false);
  assert.equal(result.record.validacion.texto_completo_ok, false);
  assert.equal(result.record.validacion.apta_para_sintesis, false);
  assert.equal(result.record.analisis, null);
  assert.equal(result.record.generacion.solicitudes_ia, 0);
  assert.equal(generated, 0);
  assert.equal(fixture.calls.confirmation, 1);
  assert.equal(fixture.calls.close, 1);
  assert.deepEqual(JSON.parse(await readFile(result.path, "utf8")), result.record);
  await assert.rejects(readFile(`${result.path}.lock`), { code: "ENOENT" });
});

test("la confirmación no acepta bloqueo persistente, lectura parcial o truncada", async (t) => {
  for (const [name, config, code] of [
    [
      "sigue verificación",
      { markup: CHALLENGE },
      "TEXTO_COMPLETO_NO_DISPONIBLE",
    ],
    [
      "abstract",
      { markup: htmlDocument([["Abstract", "Incompleto."]]) },
      "COBERTURA_INSUFICIENTE",
    ],
    [
      "sin cierre",
      { markup: htmlDocument().replace("</article>", "") },
      "COBERTURA_INSUFICIENTE",
    ],
    [
      "transferencia truncada",
      { headers: { "content-length": "999999" } },
      "TEXTO_COMPLETO_NO_DISPONIBLE",
    ],
    ["HTTP parcial", { status: 206 }, "TEXTO_COMPLETO_NO_DISPONIBLE"],
    [
      "content-range",
      { headers: { "content-range": "bytes 0-99/1000" } },
      "TEXTO_COMPLETO_NO_DISPONIBLE",
    ],
    ["HTTP error", { status: 500 }, "TEXTO_COMPLETO_NO_DISPONIBLE"],
    [
      "gráfico",
      {
        markup: htmlDocument().replace(
          "</article>",
          '<figure><img src="evidencia.png"></figure></article>',
        ),
      },
      "COBERTURA_INSUFICIENTE",
    ],
  ])
    await t.test(name, async (t) => {
      const fixture = browserFixture(t, config);
      await assert.rejects(
        retrieveDocumentWithHumanVerification(URL, fixture.options),
        { code },
      );
      assert.equal(fixture.calls.launch.length, 1);
      assert.equal(fixture.calls.confirmation, 1);
      assert.equal(fixture.calls.close, 1);
    });
});

test("rechaza respuestas excesivas, URL no HTTP(S) y cuerpo de navegación fallido", async (t) => {
  for (const change of [
    (response) => {
      response.allHeaders = async () => ({
        "content-length": String(MAX_DOCUMENT_BYTES + 1),
      });
    },
    (response) => {
      response.body = async () => Buffer.alloc(MAX_DOCUMENT_BYTES + 1);
    },
    (response) => {
      response.url = () => "file:///documento.html";
    },
    (response) => {
      response.body = async () => {
        throw new Error("Fallo artificial");
      };
    },
  ]) {
    const fixture = browserFixture(t);
    change(fixture.response);
    await assert.rejects(retrieveInBrowser(URL, fixture.options), {
      code: "TEXTO_COMPLETO_NO_DISPONIBLE",
    });
    assert.equal(fixture.calls.close, 1);
  }
});

test("sin terminal o ejecutable válido informa un diagnóstico sin filtrar excepciones", async (t) => {
  const fixture = browserFixture(t);
  await assert.rejects(
    retrieveDocumentWithHumanVerification(URL, {
      ...fixture.options, input: { isTTY: false },
    }),
    /terminal interactiva/,
  );
  await assert.rejects(
    retrieveInBrowser(URL, {
      ...fixture.options,
      env: { ...fixture.env, FICHAS_BROWSER_PATH: "relativo/chrome" },
    }),
    /ruta absoluta/,
  );
  assert.equal(fixture.calls.launch.length, 0);
  await assert.rejects(
    retrieveInBrowser(URL, {
      ...fixture.options,
      launchBrowser: async () => {
        throw new Error(fixture.env.GEMINI_API_KEY);
      },
    }),
    (error) => {
      assert.match(error.message, /No se pudo abrir Chrome/);
      assert.ok(!error.message.includes(fixture.env.GEMINI_API_KEY));
      return true;
    },
  );
  await retrieveInBrowser(URL, {
    ...fixture.options,
    env: { ...fixture.env, FICHAS_BROWSER_PATH: "/ruta/artificial/chromium" },
  });
  assert.equal(
    fixture.calls.launch[0].executablePath,
    "/ruta/artificial/chromium",
  );
  assert.equal(fixture.calls.launch[0].channel, undefined);
});

test("espera humana: Enter continúa; cancelar, Ctrl+C, EOF y aborto interrumpen", async (t) => {
  for (const action of ["enter", "cancelar", "ctrl+c", "eof", "aborto"]) {
    const { options } = browserFixture(t);
    const controller = new AbortController();
    const waiting = waitForHuman({ ...options, signal: controller.signal });
    const expected =
      action === "enter" ? waiting : assert.rejects(waiting, /canceló/);
    if (action === "enter") options.input.write("\n");
    if (action === "cancelar") options.input.write("cancelar\n");
    if (action === "ctrl+c") options.input.write("\u0003");
    if (action === "eof") options.input.end();
    if (action === "aborto") controller.abort();
    await expected;
  }
});

test("cierre, señal y tiempo límite cancelan la espera y liberan la sesión", async (t) => {
  for (const action of ["close", "SIGINT", "SIGTERM", "SIGHUP", "timeout"]) {
    const fixture = browserFixture(t);
    await assert.rejects(
      retrieveInBrowser(URL, {
        ...fixture.options,
        timeoutMs: 20,
        confirmAccess: async (options) => {
          const waiting = waitForHuman(options);
          if (action === "close") fixture.page.emit("close");
          else if (action !== "timeout") fixture.signals.emit(action);
          await waiting;
        },
      }),
      /canceló|cerró|agotaron/,
    );
    assert.equal(fixture.calls.navigation.length, 1);
    assert.equal(fixture.calls.close, 1);
  }
});

test("procesador integrado: reintento con cuerpo de 300 palabras, lock, CREADO sin promoción e idempotencia", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "ficha-browser-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = browserFixture(t, { markup: CHALLENGE });
  const env = { ...fixture.env, FICHAS_DIR: directory };
  const input = { date: DATE, url: URL };
  const identity = createIdentity(DATE, URL);
  let generated = 0;
  let confirmAccess = fixture.options.confirmAccess;
  const dependencies = {
    env,
    runGenerator: (parameters, overrides) =>
      generateFicha(parameters, {
        ...overrides,
        now: () => NOW,
        retrieve: (url, options) => {
          assert.equal(options.env, env);
          return retrieveDocumentWithHumanVerification(url, {
            ...fixture.options, ...options, confirmAccess,
          });
        },
        generate: (...args) => {
          generated += 1;
          return mockGenerate(...args);
        },
      }),
  };
  const failure = await processFicha(input, dependencies);
  assert.equal(failure.record.estado, "ERROR");
  assert.equal(failure.record.generacion.solicitudes_ia, 0);
  assert.equal(failure.record.lectura, null);
  const errorJson = await readFile(failure.path, "utf8");
  const waiting = Promise.withResolvers();
  const proceed = Promise.withResolvers();
  confirmAccess = async () => {
    waiting.resolve();
    await proceed.promise;
  };
  fixture.response.body = async () => Buffer.from(htmlDocument([
    ["Results", `Marca alfa ${Array(298).fill("artificial").join(" ")}`],
  ]));
  const retry = processFicha(input, dependencies);
  let result;
  try {
    await waiting.promise;
    assert.equal(await readFile(failure.path, "utf8"), errorJson);
    const path = await outputPath(identity, directory);
    const lock = await readFile(`${path}.lock`, "utf8");
    await assert.rejects(processFicha(input, dependencies), {
      code: "EJECUCION_EN_CURSO",
    });
    assert.equal(await readFile(`${path}.lock`, "utf8"), lock);
    assert.equal(generated, 0);
  } finally {
    proceed.resolve();
    result = await retry;
  }
  assert.equal(result.record.estado, "CREADO");
  assert.equal(result.record.intentos, 2);
  assert.equal(result.record.revision, 2);
  assert.equal(result.record.tuvo_error, true);
  assert.equal(result.record.error_actual, null);
  assert.match(result.record.lectura.alcance_y_observaciones, /cuerpo ≥300 palabras/);
  assert.match(result.record.lectura.alcance_y_observaciones,
    /No se exigieron mínimos por sección ni localización de limitaciones/);
  assert.equal(result.record.validacion.apta_para_sintesis, false);
  assert.equal(result.record.validacion.coherencia_editorial_ok, false);
  assert.equal(result.record.validacion.trazabilidad_de_hallazgos_ok, false);
  assert.equal(result.record.validacion.validada_en, null);
  const history = join(dirname(result.path), "historial", identity.key);
  const [archived] = await readdir(history);
  assert.equal(await readFile(join(history, archived), "utf8"), errorJson);
  await assert.rejects(readFile(`${result.path}.lock`), { code: "ENOENT" });
  const saved = await readFile(result.path, "utf8");
  assert.equal((await processFicha(input, dependencies)).status, "skipped");
  assert.equal(await readFile(result.path, "utf8"), saved);
  assert.equal(generated, 1);
  assert.equal(fixture.calls.launch.length, 2);
  assert.ok(!saved.includes(env.GEMINI_API_KEY));
});
